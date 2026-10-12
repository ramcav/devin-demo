---
name: new-internal-app
description: Build a new internal tool (e.g. KYC queue, disputes, feature-flag panel) on top of the platform layer, reusing its auth, policy, approvals and audit modules. Use when asked to add or generate a new internal app.
---

# Skill: build a new internal app on the platform

Use this to add any new internal tool (the KYC queue, disputes, a feature-flag panel, and so on). The app must reuse the platform layer in `src/platform/`; it never implements its own auth, permission checks, approvals or audit writes.

## Inputs

- Read `.devin/knowledge.md` and `SPEC.md` first; their rules apply to every step below.

- The app's section in `SPEC.md` (entities, statuses, flow, rules, who can do what).
- `.devin/knowledge.md` (rules and conventions).

## Outcome

A working app under `src/apps/<app>/`, listed in the launcher, with every rule enforced server-side and covered by tests, delivered as one PR with green CI.

## Steps

1. **Read the spec section and restate it** in the PR description as: entities, statuses and transitions, who can do each transition, and which transitions need approvals. If anything about permissions, approvals or money is ambiguous, ask before coding.
2. **Schema.** Add the tables to the Drizzle schema and generate a migration. Add synthetic seed data covering every status.
3. **Permissions.** Add the app's actions to `src/platform/policy.ts` (for example `kyc.case.claim`, `kyc.case.decide`, `kyc.escalation.view`). Default deny; grant only what the spec says.
4. **State machine.** Implement transitions as server actions in `src/apps/<app>/actions.ts`. Each one: `authorize()` → validate the transition → if it needs approvals, use the approvals engine → apply the change and `audit.record()` in **one transaction**.
5. **Confidentiality and masking.** If the spec restricts visibility (masked fields, hidden statuses), apply it in the query/serialization layer so restricted data never leaves the server for unauthorized roles.
6. **UI.** Build list and detail views with the platform data grid (server-side pagination). Show only the actions the current user is allowed to take. Keep the styling minimal.
7. **Launcher.** Register the app so it appears for roles that can access it.
8. **Tests.**
   - One test per rule in the spec, named after it.
   - At least one API-level test that an unauthorized role gets 403.
   - If the app uses approvals: tests for self-approval and double-approval being rejected.
   - If the app restricts visibility: a test that the API response for an unauthorized role doesn't contain the restricted data.
   - One Playwright test for the main happy path.
9. **Docs.** Add a short section to the README: what the app does, which roles use it, and anything mocked.
10. **PR.** Open one PR with: the restated spec, a checklist of rules → test names, screenshots of the main screens, and anything you decided that the spec didn't specify.

## Postconditions

- [ ] `npm run lint && npm run typecheck && npm test && npm run test:e2e` pass locally and in CI
- [ ] Every state change writes one audit row (verified by a test)
- [ ] No role checks outside `src/platform/policy.ts`
- [ ] No direct inserts into `audit_log`
- [ ] App visible in the launcher only for the right roles

## Forbidden

- Modifying anything in `src/platform/` to make the app work, unless the change is generic and called out in the PR. Platform changes need their own review.
- Weakening or skipping a test to get CI green.
- Using real personal data or full card numbers, even in seeds or tests.
