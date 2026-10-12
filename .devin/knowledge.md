# Knowledge: internal tools platform

Read this before every session in this repo. `SPEC.md` is the source of truth for scope; this file is how we work.

## Non-negotiable rules

1. **All authorization goes through `src/platform/policy.ts`.** Call `authorize(user, action, resource?)` at the top of every server action and route handler. Never check roles inline (`if (user.role === ...)`) in app code. New actions are added to the policy file, default deny.
2. **Never write to `audit_log` directly.** Use `audit.record(...)` from `src/platform/audit.ts`, inside the same database transaction as the change. Never add code that updates or deletes audit rows; the database rejects it anyway.
3. **Approvals go through the approvals engine** (`src/platform/approvals.ts`). Apps declare how many approvals an item needs and which role can approve; they never re-implement self-approval or double-approval checks.
4. **The server is the source of truth.** Hiding a button is UX, not security. Every rule in `SPEC.md` is enforced server-side and covered by a test.
5. **Synthetic data only.** No real names, IDs or card numbers. Cards are payment method tokens (`pm_…`) plus last4; never store or render a full card number.
6. **Masking and confidentiality are enforced in the data layer**, not only in components: API responses for unauthorized roles must not contain unmasked national IDs or escalation data.
7. **Talk to external systems only through ports** (see Architecture below), never by calling an API directly from app code.
8. **Decisions and enums from user input are parsed strictly; anything unknown fails closed.** Use `parseDecision()` from `src/platform/decisions.ts` for approve/reject (a missing or unknown value is a 400, never a default), and validate other enums against their value lists.

## Architecture

- **Ports and adapters for anything external.** Auth, payments and (later) the KYC vendor sit behind an interface in `src/platform/ports/` with an adapter in `src/platform/adapters/`. Swapping mock auth for Entra ID, or the mock payments API for Stripe, touches one adapter, never app code.
- **Modular apps.** Each app in `src/apps/<app>/` depends only on `src/platform/`. Apps never import from each other.
- **Test first for rules.** For every invariant in `SPEC.md`, write the failing test before the implementation.
- **Reuse before you write.** If two apps need the same thing, it belongs in the platform; don't copy it between apps.
- **No speculative abstraction.** Build what the spec needs today; three similar lines beat a premature framework.

## Conventions

- TypeScript strict mode; no `any` in platform code.
- Folder layout: `src/platform/*` (shared, reviewed hard), `src/apps/<app>/*` (one folder per internal tool), `tests/` mirrors `src/`.
- Database: Drizzle schema + SQL migrations in `drizzle/`. Database-level guarantees (the audit trigger) live in migrations.
- Each invariant test is named after its ID in `SPEC.md`, e.g. `INV-3: refunds over $500 need two distinct approvers`.
- Keep PRs small and focused: one app or one platform module per PR. The PR description lists which invariants it covers.
- Run `npm run lint && npm run typecheck && npm test` before opening a PR. CI must be green.

## How to run

- `docker compose up` starts Postgres and the app on http://localhost:3000 (migrations + seed run on start).
- `npm test` runs Vitest against the Compose Postgres; `npm run test:e2e` runs Playwright.

## When unsure

Stop and ask rather than guess on anything that touches permissions, approvals, audit or money. For everything else (naming, UI layout), make a reasonable choice and note it in the PR.
