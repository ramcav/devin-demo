---
name: refunds-browser-walkthrough
description: Record the local internal-tools Refunds maker-checker flow with seeded mock users and audit evidence.
---

# Refunds browser walkthrough

## Setup
- Use the repository's Docker Compose app at http://localhost:3000; if unavailable, run `docker compose up -d --build` from the repo root. It migrates and seeds on startup.
- `/login` lists synthetic identities. Buttons have accessible names `Sign in as <Name>`; visible button text is the user's role. Switch identity through header **Sign out**.
- Confirm mock authentication and payments adapters in Compose before describing results; a paid status here proves mock-provider integration, not real payment settlement.

## Primary flow
- Use Ana Approver as maker when demonstrating engine-level self-approval denial; requester-role users cannot approve. Explicitly distinguish maker from requester role in reports.
- Launcher → Refunds → New refund. The server-paged charge picker initially sorts by date. Click **Refundable** twice for descending (first click selects ascending); use a charge with sufficient remaining balance rather than a hardcoded charge.
- A $750 request requires two approvals. Retain its generated `rf_...` ID and masked card suffix.
- On Ana's own refund, Approve/Reject are disabled with the note "You raised this refund, so a different approver must approve it." (UX only). To show the server-side engine block, POST `/api/refunds/<id>/approve` with Ana's session (e.g. from the browser devtools console: `fetch(location.pathname.replace('/refunds/','/api/refunds/')+'/approve',{method:'POST',body:'{}'})`): expect 403 `approval_denied:self_approval` and status still pending. Ben's approval leaves 1 of 2 pending; Cleo's produces paid, 2 of 2, and `re_...` provider ID.
- Aldo Auditor → Audit log → filter **Entity id**, then click **At** for ascending. Check the exact ordered events and actor IDs, plus `self_approval`, provider refund ID, and `paidTo`.
- Capture the five-event audit evidence **before** optional unauthorized requester access checks; these can append `authz.denied` events for the same entity.
- Optional: Rita Requester visiting someone else's refund URL should see **403 · Forbidden** without refund details.

## Devin Secrets Needed
None for the seeded local mock-auth/mock-payments flow.
