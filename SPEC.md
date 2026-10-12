# SPEC: Internal tools platform (prototype)

## Context

A fictional Series C fintech (~60 engineers) runs three internal tools on Microsoft Power Apps (KYC review queue, refunds dashboard, feature-flag admin) and plans 10+ more. This prototype tests one idea:

> A governed platform, written once, plus Devin generating apps on top of it, makes internal tool #N cheap **and** safe.

So the platform layer matters more than any single app. Security primitives live in the platform, are tested once, and every app reuses them. Apps never implement their own auth, permission checks or audit writes.

All data is synthetic. No real PII, no real card numbers.

## Stack

- Next.js (App Router) + TypeScript, server-side route handlers / server actions
- PostgreSQL 16 via Docker Compose
- Drizzle ORM + SQL migrations
- Tailwind + shadcn/ui (minimal styling; no time on polish)
- Vitest (unit/integration against a real Postgres) + Playwright (end-to-end)
- GitHub Actions CI: lint, typecheck, tests

One command to run everything locally: `docker compose up`, then the app at http://localhost:3000.

## Roles

| Role | Can |
| --- | --- |
| `requester` | Create refund requests; view own requests |
| `approver` | Approve or reject refunds created by someone else |
| `kyc_reviewer` | Work KYC cases: claim, review, propose a decision |
| `compliance` | Everything a KYC reviewer can, plus: second approval on KYC rejections and high-risk approvals, see escalations, see unmasked PII |
| `auditor` | Read-only access to every app and the audit log |
| `admin` | Manage users and roles |

Seed at least: 2 requesters, 2 approvers, 2 KYC reviewers, 1 compliance officer, 1 auditor, 1 admin.

## Platform layer (`src/platform/`)

1. **Auth (mock).** A login page with a user picker that sets a signed session cookie. No passwords. Production would use Entra ID over OIDC; auth sits behind the auth port (`getCurrentUser()`), so swapping the provider means writing one new adapter.
2. **Policy (RBAC).** One file, `src/platform/policy.ts`, maps `role → allowed actions` (e.g. `refund.create`, `refund.approve`, `kyc.escalation.view`). Default deny. Every server action and route calls `authorize(user, action, resource?)` before doing anything. The UI hides buttons too, but the server is the source of truth.
3. **Approvals engine.** Generic maker-checker: an entity has a `created_by`, a required number of approvals, and a list of approvals. Rules enforced server-side:
   - the creator can never approve their own item;
   - the same person can't approve twice;
   - an item is approved only when it has the required number of distinct approvals;
   - one rejection rejects the item.
4. **Audit log.** One `audit_log` table: `id, at, actor_id, actor_role, action, entity_type, entity_id, before (jsonb), after (jsonb), reason, request_id`. **Append-only, enforced in the database:** a trigger raises an error on `UPDATE` or `DELETE`. Apps never insert into it directly; they call `audit.record(...)` in the **same transaction** as the change it describes. If the audit write fails, the change rolls back.
5. **Data grid.** A reusable table component with **server-side** pagination, sorting and filtering, so there's no row ceiling.
6. **Integrations (ports and adapters).** Each external system is an interface in `src/platform/ports/` with an adapter in `src/platform/adapters/`. For this prototype: an auth port with a mock adapter, and a payments port with a mock payments adapter (see Refunds).
7. **App shell.** A launcher listing the apps the current user can access, and an **Audit** page (read-only, filterable) for the `auditor` and `compliance` roles.

## App 1: Refunds (`src/apps/refunds/`)

- **Entities:** `charges` (from the mock payments provider: id, customer, amount, currency, payment method token like `pm_…`, last4) and `refund_requests` (id, charge_id, amount, reason, status, created_by, created_at).
- **Flow:** requester picks a charge → enters amount and reason → request is `pending` → approvers approve or reject → when fully approved, the platform calls the mock payments API `POST /refunds` and the status becomes `paid`.
- **Rules:**
  - refunds of **$500 or less** need **1** approval; **more than $500** need **2** distinct approvals;
  - refund amount must be > 0 and ≤ the original charge minus anything already refunded;
  - a refund always goes back to the **original payment method token**; there's no field to change the destination;
  - cards are only ever shown masked (`•••• 4242`).
- **Mock payments provider:** a small in-repo module or route (`/api/mock-payments/...`) that serves seeded charges and accepts refunds. The app talks to it only through the payments port (`src/platform/ports/payments.ts`), implemented by the mock adapter.

## App 2: KYC review queue (`src/apps/kyc/`): build this with the playbook

This app is deliberately specified at the same level of detail a business owner would give. It must be built by following `playbooks/new-internal-app.md`, reusing the platform layer.

- **Entities:** `kyc_cases` (id, customer name, date of birth, national ID number, country, risk level `low|medium|high`, status, assigned_to, created_at) and `kyc_notes` (case_id, author, body, created_at).
- **Statuses:** `new → in_review → approved | rejected | escalated`.
- **Flow:** a reviewer claims a `new` case → reviews it → proposes approve or reject with a reason.
  - Approving a **low/medium** risk case: done by one reviewer.
  - **Rejecting any case**, or **approving a high-risk case**: needs a second approval from `compliance` (four-eyes, via the approvals engine).
  - A reviewer can **escalate** a case to compliance with a note.
- **Confidentiality:**
  - Escalations and escalation notes are visible **only** to `compliance` (and `auditor`). For other roles, an escalated case simply shows as `in_review`; they must not be able to tell it was escalated, from the UI or the API.
  - National ID numbers are masked (last 4 only) for everyone except `compliance`.
- Seed ~50 synthetic cases across all risk levels and statuses.

## Invariants (each one has an automated test)

| ID | Invariant |
| --- | --- |
| INV-1 | A user can't approve an item they created (refunds and KYC). Rejected server-side, not just hidden in the UI. |
| INV-2 | The same user can't approve the same item twice. |
| INV-3 | Refunds over $500 stay `pending` until two distinct approvers approve. |
| INV-4 | A refund can't exceed the remaining refundable amount of its charge. |
| INV-5 | A refund is always issued to the charge's original payment method token. |
| INV-6 | Every state change writes exactly one audit row, in the same transaction. |
| INV-7 | `UPDATE` and `DELETE` on `audit_log` fail at the database level. |
| INV-8 | Every server action calls `authorize()`; an unauthorized role gets 403 (test at least one per app via the API). |
| INV-9 | KYC rejections and high-risk approvals require a compliance approval. |
| INV-10 | Non-compliance roles can't see escalations or unmasked national IDs, via UI or API. |

## Acceptance criteria

- `docker compose up` starts Postgres and the app; migrations and seed run automatically.
- `npm test` runs all invariant tests green; `npm run test:e2e` runs the Playwright flows.
- CI runs lint, typecheck and tests on every PR.
- README explains what it is, how to run it, the role/user list, what is mocked, and what production would need.

## Out of scope

Real SSO/MFA, encryption and key management, deployment, monitoring, OFAC screening, transaction monitoring, SAR filing, a real KYC vendor, data-retention jobs, feature-flag admin (would be another app on the same platform), and UI polish.
