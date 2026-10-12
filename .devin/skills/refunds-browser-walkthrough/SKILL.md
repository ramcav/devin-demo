---
name: refunds-browser-walkthrough
description: Test and record the local internal-tools Refunds maker-checker and CSV-export workflows with seeded mock users and audit evidence.
---

# Refunds browser walkthrough

## Setup
- Read the repository blueprint first. Use Docker Compose at http://localhost:3000; `docker compose up -d --build` migrates/seeds on startup.
- For a manual server, use the blueprint's Postgres-only and mock-auth/mock-payments environment. Load NVM and select Node 22 in every new shell.
- A production `npm start` serves the last build, not current source. Rebuild/restart after product changes, preserving the database and fixture IDs. Test-only changes do not require a rebuild.
- `/login` lists synthetic identities. Buttons have accessible names `Sign in as <Name>` and visible role labels. Header **Sign out** clears the session.
- Mock payments prove provider-adapter integration, not real payment settlement.
- Maximize Chrome before one primary recording. Establish real data first; keep secondary validation checks in labeled screenshots.

## Browser interaction reliability
- Chrome may autocomplete `/refunds` to a previously visited detail or new-refund URL. After entering a URL, remove any selected autocomplete suffix before Return and verify the resulting URL.
- Native date inputs are segmented. Click the month and enter two month digits, two day digits, then four year digits; Chrome auto-advances. Extra Right keys can skip segments. Verify the actual date before submitting.
- Native CSV downloads may go to the Chrome profile's Downloads directory even when a CDP observer requests a different directory. Locate the real downloaded file; do not substitute a separately generated CSV.
- Passive response/download observation is useful for HTTP status, headers, filename, and request payload evidence. Use browser UI for normal actions. API fixture setup or bypasses require explicit authorization; never extract browser cookies for curl.
- Coordinate with other tests sharing the database: extra fixtures and audit rows may appear. Compare retained fixture IDs and a timestamped audit baseline, not a globally assumed zero count.

## Maker-checker primary flow
- Use an approver as maker when demonstrating engine-level self-approval denial. Requester-role users cannot approve; distinguish requester role from maker status.
- Launcher → Refunds → New refund. Select a charge with sufficient remaining balance rather than hardcoding one. The picker is server-paged; click **Refundable** twice for descending order.
- Retain each generated `rf_...` ID. A request over $500 requires two distinct approvals.
- On a maker's own refund, Approve/Reject should be disabled with the self-approval explanation. If explicitly authorized to demonstrate engine-level denial, use the documented approve endpoint and verify 403, unchanged status, and audit reason.
- First distinct approval leaves pending, 1 of 2; second produces paid, 2 of 2, with a provider `re_...` ID.
- Verify Reject actually results in rejected, not an approval. If multiple submit buttons lose their submitter value, capture the server-action payload and report the problem separately. Do not silently classify a paid fixture as rejected. When authorized, the explicit reject API can supply a rejected fixture; reload and verify visible rejection attribution.
- Aldo Auditor → Audit log → filter **Entity id**, then sort **At** ascending. Check ordered events, actor IDs, provider refund ID, and masked `paidTo`. Capture the expected business-event sequence before optional authorization attempts append extra events.

## CSV export primary flow
- Requester sees no export form. Approver and auditor see **Created from (UTC)**, **Created to (UTC)**, **Export status**, and **Download CSV** on `/refunds`. Fresh page load defaults to the previous UTC calendar month.
- Persist one paid refund with two approvers and a reason beginning `=`, containing comma/quotes/Unicode; persist a separate rejected fixture with a reason beginning `+`.
- Export today's date through the native form. Check response attachment filename and actual bytes: UTF-8 BOM, CRLF, exact required header, decimal amount/currency, requested-by, ordered approver names, rejector, paid timestamp/provider ID, formula prefixing, and no customer/card/payment-method data.
- Filter the grid's **Status**, click **Filter**, and verify the export-status prefill. Export rejected rows and verify the filename suffix and absence of paid fixtures.
- **Clear** may leave uncontrolled form values visible after client-side navigation. Check URL, grid, and export select together; do not assume the new default replaced the current input value. Report stale values, then hard-reload for a known fresh-page baseline.
- Export a range excluding created records and verify BOM/header/CRLF only. Same-day inclusion demonstrates inclusive UTC dates but does not prove exact midnight boundaries.
- Check successful `refund.exported` audit rows: entity type `refund_export`, exact from/to/status filters, and row count matching downloaded CSV. Correlate each observed successful request to one event.
- Exercise the inclusive 366-day cap using a leap-year UI range and a cross-year direct URL. A 367-day UI submission and direct URL must return 400 with the split-file explanation and no successful-export audit event.
- Negative URLs: invalid calendar date, reversed range, missing date(s), malformed date, invalid status. Verify 400 and no downloads/export events. Only approver/auditor are authorized: requester, compliance, admin, and KYC reviewer get 403 plus `authz.denied`; signed-out gets 401.
- Leading whitespace is trimmed by refund creation; do not claim all six formula-start characters were exercised if only `=` and `+` fixtures were persisted.

## Devin Secrets Needed
None for the seeded local mock-auth/mock-payments flow.
