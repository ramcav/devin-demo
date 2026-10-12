# Build log

How this prototype was built with Devin. Times are UTC on 2026-10-12, from Devin's session events and git. ACUs aren't metered per session on the plan used (the session record shows 0.0), so wall-clock time is the figure.

| # | Session | Started | Ended | Wall-clock | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Platform layer + Refunds (planning mode) | 21:31 | 22:06 (merged) | ~35 min | #1 | Plan sent in 1 min; ~4 min waiting on my approval. 5 checkpoints, recorded browser walkthrough, CI green. |
| 2 | KYC queue with the `new-internal-app` skill | 22:09 | 22:54 (merged) | ~45 min | #2 | Failing tests committed first (`873c6d6`), then the service. Includes fixing the snapshot setup and one Devin Review round. |
| 3 | Ops request via Slack (CSV export) | 22:56 | 23:34 (#4 merged) | ~38 min | #3, #4 | Requested from `#ops-requests` as a finance-ops user. #3 is left open on purpose for the demo. #4 is the bug Devin's browser test found on main. |

About 2 hours of Devin time in total for the platform, two apps, one ops request and one bug fix.

## What Devin got wrong, and how it was caught

- **Reject could pay out a refund (sessions 1–2, caught in session 3).** The Refunds server action treated any decision that wasn't exactly `"reject"` as `"approve"`. A form submitted without the button value (focus Reject, press Enter) approved and paid the refund. The KYC app, generated from the skill with Refunds as its model, copied the same line. All invariant tests passed, because the gap was between the form and the service. Devin's own browser testing agent found it while recording the CSV walkthrough, and stopped to ask before touching money. Fixed in #4: a shared `parseDecision()` in the platform (unknown or missing value is a 400), buttons send an explicit value, e2e tests for Reject in both apps, and a new rule 8 in `.devin/knowledge.md` so future apps fail closed.
- **Full national IDs loaded for reviewers (session 2, caught by Devin Review).** The query returned the masked ID but also selected the full one for roles without PII access; the PR description claimed it was never loaded. Fixed in `7d898b4`.
- **Escalation notes copied into the audit log (session 2, caught by Devin Review).** Audit viewers could read confidential notes outside the KYC masking rules. Fixed in `7d898b4`.
- **Compliance could act on decisions that had already completed (session 2, caught by Devin).** Found while reviewing its own implementation; fixed with a test in `8aaf720`.
- **The first fix for the reject bug checked input before permissions (session 3, caught by Devin Review using the repo rules).** Unauthorized callers got 400 instead of 401/403. Fixed in `2598e69`.
- **Stale environment snapshot (session 3).** The snapshot was built before #1 added `package.json`, so the pull at session start failed. Devin diagnosed it and rebuilt the blueprint from main.

## Changes made to the plan before Devin started coding

- Session 1: approvers can also create refunds, with a third seeded approver, so self-approval is blocked by the approvals engine on a real maker instead of by a role 403.
- Session 1: denials are audited (`authz.denied`, `approval.denied`) as their own rows, outside INV-6.
- Session 1: trimmed scope to what the demo needs; the blueprint starts Postgres and the app.
- Session 1 (at checkpoint 3): the creator sees Approve/Reject disabled with an explanation; the server still enforces it.
- Sessions 1–2: walkthrough skills saved in the repo (`.devin/skills/`), not at account scope.
- Session 2: a second compliance officer, so one officer's rejection can be approved by another. Devin's other four questions: its defaults.
- Session 3: accepted all six defaults from Slack ("go"). Devin proposed the export audit row and spreadsheet-formula escaping unprompted.

## Review findings (Devin Review / my review)

- #1: reviewed by me (Devin Review wasn't on yet). Checked tests-first order, no inline role checks, no direct audit writes, append-only trigger, CI.
- #2: Devin Review, 4 findings (2 security above, plus a lost "assigned to me" filter and duplicated seed notes); all fixed before merge. My review: platform changes limited to policy, launcher and seed.
- #3: Devin Review found no issues. My comment: cap the export range at 366 days; Devin added it with tests for both edges (`ba727ed`).
- #4: Devin Review, 1 finding based on the repo rules (parse after `authorize()`); fixed before merge.
