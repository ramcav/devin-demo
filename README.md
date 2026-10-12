# Internal tools platform (Devin prototype)

A prototype for a build-vs-buy question: can a fintech replace Microsoft Power Apps for its internal tools by building them in-house with Devin?

The approach: build one governed platform layer once (auth, role-based permissions, maker-checker approvals, an append-only audit log, server-paged tables), then have Devin generate each internal app on top of it from a written recipe (a Devin skill).

- **What to build:** [`SPEC.md`](SPEC.md)
- **How we build (rules for Devin):** [`.devin/knowledge.md`](.devin/knowledge.md)
- **Recipe for every new app (Devin skill):** [`.devin/skills/new-internal-app/SKILL.md`](.devin/skills/new-internal-app/SKILL.md)
- **Recipe for every new integration (Devin skill):** [`.devin/skills/new-integration/SKILL.md`](.devin/skills/new-integration/SKILL.md)
- **Recorded Refunds walkthrough (Devin skill):** [`.devin/skills/refunds-browser-walkthrough/SKILL.md`](.devin/skills/refunds-browser-walkthrough/SKILL.md)
- **How it was built:** [`BUILD_LOG.md`](BUILD_LOG.md)

## Run it

```bash
docker compose up            # Postgres 16 + the app on http://localhost:3000 (migrations + seed run on start)
```

Open http://localhost:3000, pick a user on the mock login page, and use the launcher.

Local development without the app container:

```bash
docker compose up -d db      # Postgres only, on localhost:5432
cp .env.example .env.local   # Next.js reads it; scripts read process env
npm ci
DATABASE_URL=postgres://app:app@localhost:5432/app npm run db:migrate
DATABASE_URL=postgres://app:app@localhost:5432/app npm run db:seed
npm run dev
```

Checks (CI runs the same):

```bash
npm run lint && npm run typecheck && npm test   # Vitest recreates the app_test database on every run
npm run test:e2e                                # Playwright; reuses a server on :3000 or starts `npm start`
```

## Users and roles (all synthetic)

| User | Role | In this prototype |
| --- | --- | --- |
| Rita Requester, Ravi Requester | `requester` | Create refund requests; see only their own |
| Ana, Ben, Cleo Approver | `approver` | Create refunds and approve/reject other people's refunds |
| Kim Reviewer, Kai Reviewer | `kyc_reviewer` | KYC app (not built yet) |
| Cora Compliance | `compliance` | Audit page; KYC second approvals (later) |
| Aldo Auditor | `auditor` | Read-only: every refund and the audit page |
| Ada Admin | `admin` | Manage users and roles (no UI yet) |

Permissions live in one file, [`src/platform/policy.ts`](src/platform/policy.ts) (default deny).

## Platform layer (`src/platform/`)

- **Policy:** `authorize(user, action, resource?)` at the top of every service function; denials return 403 and are audited as `authz.denied`.
- **Approvals engine:** generic maker-checker (`approvals.decide`): no self-approval, no double approval, N distinct approvals, one rejection rejects. Engine denials are audited as `approval.denied`.
- **Audit log:** `audit.change()` runs a state change and its single audit row in one transaction. A trigger makes `audit_log` append-only (UPDATE/DELETE/TRUNCATE raise).
- **Data grid:** server-side pagination, sorting and filtering via URL params (`page`, `sort`, `dir`, `f_<column>`), with whitelisted columns.
- **App shell:** launcher filtered by policy, and the `/audit` page for `auditor` and `compliance`.

## Refunds app (`src/apps/refunds/`)

Requester or approver picks a charge, enters amount and reason → `pending` → approvers approve/reject → when fully approved the platform calls the payments port and the refund becomes `paid` (or `payment_failed`, retryable by an approver with the same idempotency key). Refunds of $500 or less need 1 approval, over $500 need 2. The refundable balance counts pending, approved, paid and failed-payment refunds. Cards are only shown as `•••• 4242`; refunds always go to the charge's original payment method token.

## Integrations (ports and adapters)

Apps depend only on ports in `src/platform/ports/`; adapters live in `src/platform/adapters/` (ESLint blocks app imports from adapters). Each port has a shared contract suite in `tests/platform/ports/*.contract.ts` that every adapter must pass.

### Auth (`ports/auth.ts`)

| Variable | Purpose |
| --- | --- |
| `AUTH_ADAPTER` | `mock` (only option today) |
| `SESSION_SECRET` | HMAC key for the session cookie |

The mock adapter is a user picker that sets an HMAC-signed, expiring session cookie. No passwords. Production would add an Entra ID (OIDC) adapter implementing the same `AuthPort` and pass the same contract tests.

### Payments (`ports/payments.ts`)

Domain operations: `listCharges`, `getCharge`, `issueRefund({ chargeId, amountCents, idempotencyKey })` (no destination field). Domain errors: `ChargeNotFound`, `RefundExceedsCharge`, `PaymentDeclined`, `ProviderUnavailable`.

| Variable | Purpose |
| --- | --- |
| `PAYMENTS_ADAPTER` | `mock` (HTTP to the in-repo provider, default) or `memory` (in-process, used by tests) |
| `MOCK_PAYMENTS_BASE_URL` | Base URL of the simulated provider (`/api/mock-payments`) |
| `PAYMENTS_TIMEOUT_MS` | Per-call timeout |
| `MOCK_PAYMENTS_SLOW_MS` | How long the simulated provider stalls for `ch_sim_slow` |

- **What the mock simulates:** a vendor-shaped API (`GET /charges`, `GET /charges/:id`, `POST /refunds` with an `Idempotency-Key` header) over seeded synthetic charges, persisted in `mock_payments_*` tables. Special charges trigger errors: `ch_sim_decline` (402 → `PaymentDeclined`), `ch_sim_unavailable` (503 → `ProviderUnavailable`), `ch_sim_slow` (timeout → `ProviderUnavailable`).
- **Resilience:** every call has a timeout. The HTTP adapter retries `ProviderUnavailable` up to 2 times, reads and refunds alike; refunds are safe to retry because the refund request id is sent as the idempotency key.
- **Audit:** the outcome of every refund call is recorded as `refund.paid` (with the provider refund id) or `refund.payment_failed`, in the same transaction as the status change.
- **Switching to a real processor:** add `src/platform/adapters/payments/<vendor>.ts` implementing `PaymentsPort`, run `paymentsPortContract` against its sandbox behind an env flag, and select it with `PAYMENTS_ADAPTER`. No app code changes.

## What is mocked, and what production would need

- Mocked: identity provider (user picker), payment processor (in-repo simulated API), all data (synthetic).
- Production would need: Entra ID/OIDC with MFA and group-to-role mapping, a real processor adapter with least-privilege restricted keys, secrets in a vault, the database role used by the app without `TRIGGER`/owner rights on `audit_log`, audit export to WORM storage, deployment and monitoring. Out of scope per [`SPEC.md`](SPEC.md).

All data in this repository is synthetic.
