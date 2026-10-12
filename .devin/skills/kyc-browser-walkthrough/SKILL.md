---
name: kyc-browser-walkthrough
description: Record the local KYC queue's four-step maker-checker rejection, confidential escalation, and role-based national-ID walkthrough with seeded mock users.
---

# KYC browser walkthrough

Repository-only skill for ramcav/devin-demo. Store at `.devin/skills/kyc-browser-walkthrough/SKILL.md`, not account or personal scope.

## Setup
- Use http://localhost:3000. Check it responds before starting anything; a redirect to `/login` is expected when signed out. If unavailable, run `docker compose up -d --build` from the repo root; startup migrates and seeds. An already-running production build with Compose environment variables also works.
- `/login` uses a mock identity provider and synthetic data. Buttons have accessible names `Sign in as <Name>` but show the user's role as visible text. Switch users with header **Sign out**, then select the intended identity.
- Kim Reviewer and Kai Reviewer have `kyc_reviewer`; Cora Compliance and Cyd Compliance have `compliance`.
- Launcher → **KYC review queue**, or `/kyc`. Detail URLs are `/kyc/<case-id>`.
- Existing e2e runs mutate cases. Choose fresh **new** cases through list filters, verify **Unassigned** and **No decisions yet**, and retain their IDs/URLs. Do not assume a hardcoded case is unused or reset the shared database.
- Maximize the browser before recording (`wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz` on this Linux desktop). Begin one continuous recording only after the populated queue is ready; annotate all four steps.

## Primary flow
1. **Kim proposes a high-risk rejection.** In the list choose **Status=new**, **Risk=high**, then **Filter**. Open a fresh result, retain ID A, and click **Claim this case**. Verify **in review** and **Kim Reviewer** assigned. Under **Propose a decision**, select **Reject**, enter a specific reason, and click **Propose decision**. Show **Pending decision**, **Reject proposed by Kim Reviewer**, the reason, and status still **in review**. Capture step 1.
2. **Two reviewers cannot decide; compliance can.** On A as Kim verify no compliance **Approve/Reject** buttons. Sign out, sign in as Kai, navigate to the retained URL; show the same pending panel, reason and **in review**, with no decision controls. Sign in as Cora on A; under **Compliance decision** click **Approve**. This approves the *rejection proposal*, so case status becomes **rejected**. The pending panel disappears and decision history says **Approved by Cora Compliance**. Capture step 2.
   - Optional self-approval demonstration requires a separate case proposed by a compliance user: **Approve/Reject** must be disabled and the note must read **You proposed this decision — another compliance officer must decide it.** Kim's missing controls prove reviewer-role UX gating, not server-side self-approval enforcement.
3. **Escalation is confidential to other reviewers.** As Kim choose another fresh case B using **Status=new**, **Risk=Any** and **Filter**. Claim it. Under **Escalate**, enter a distinctive confidential string in **Escalation note (required)**, then click **Escalate to compliance**. Sign in as Kai, open B, and inspect the entire page: it must show only **in review**, no escalation wording and no confidential note. Empty **Notes** may say **No notes yet.** Capture step 3. Return to the queue and visibly open the **Status** dropdown: options are **Any**, **new**, **in review**, **approved**, **rejected**; no **escalated**.
4. **Compliance sees full details; reviewers retain only last four.** Cora opens B: status **escalated**, exact note visible in **Notes** with **Escalation** badge, and full national ID beginning **SYN**. Record the last four digits. Then Kai or Kim opens that exact same B: national ID must be **•••• ** followed by those four digits, with escalation details still absent. Annotate the exact suffix match. Capture compliance and reviewer screenshots side-by-side for step 4.

## Gotchas and evidence
- Sign-in redirects to the launcher. Let navigation finish and verify the header identity before entering a retained case URL or interacting with filters. Chaining navigation and coordinate clicks too quickly can act on stale content; use separate settled actions.
- Filters apply only after **Filter**. Capture the filtered list before opening the fresh high-risk case.
- Case status **rejected** is different from a proposal status **approved**: a compliance-approved Reject proposal correctly produces that combination.
- Kim's own escalation form disappears after submitting; her detail remains **in review** and her escalation note is hidden too. Verify the write through Cora's view, rather than treating the reviewer's masked status as a failed transition.
- The compliance note may be below the forms; scroll or use a sufficiently tall viewport to show it, the full ID, status, and case ID. Inspect the complete reviewer page for absence claims.
- Save one primary recording and key screenshots per step; include both full/masked ID views, role headers, exact case IDs and suffix in the report. Disclose optional coverage omitted. Browser-only evidence does not establish direct API or network-payload enforcement.

## Devin Secrets Needed
None for the seeded local mock-auth KYC flow.
