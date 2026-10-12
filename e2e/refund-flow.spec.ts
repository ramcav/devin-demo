import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await expect(page.getByTestId("current-user")).toContainText(name);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test("$750 refund: self-approval blocked, two approvers, paid, fully audited", async ({ page }) => {
  // Approver A creates the refund on the charge with the most refundable balance.
  await signInAs(page, "Ana Approver");
  await page.goto("/refunds/new?sort=remainingCents&dir=desc");
  await page.getByRole("link", { name: /^Select ch_/ }).first().click();
  await page.getByLabel("Amount (USD)").fill("750");
  await page.getByLabel("Reason").fill("Customer received a damaged item (synthetic)");
  await page.getByRole("button", { name: "Submit refund request" }).click();
  await expect(page).toHaveURL(/\/refunds\/rf_/);
  const refundUrl = page.url();
  const refundId = refundUrl.split("/").pop()!;
  await expect(page.getByTestId("refund-status")).toHaveText("pending");
  await expect(page.getByTestId("refund-amount")).toHaveText("$750.00");
  await expect(page.getByTestId("refund-approvals")).toHaveText("0 of 2 required");

  // A can't approve their own refund: the UI disables the buttons…
  await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reject" })).toBeDisabled();
  await expect(page.getByTestId("creator-note")).toHaveText("You raised this refund, so a different approver must approve it.");
  // …and the approvals engine still rejects the attempt server-side.
  const selfApproval = await page.request.post(`/api/refunds/${refundId}/approve`, { data: {} });
  expect(selfApproval.status()).toBe(403);
  expect((await selfApproval.json()).error).toBe("approval_denied:self_approval");
  await page.reload();
  await expect(page.getByTestId("refund-status")).toHaveText("pending");
  await signOut(page);

  // Approver B approves: still pending (1 of 2).
  await signInAs(page, "Ben Approver");
  await page.goto(refundUrl);
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("status")).toHaveText("Refund is now pending");
  await expect(page.getByTestId("refund-approvals")).toHaveText("1 of 2 required");
  await signOut(page);

  // Approver C approves: paid via the payments port.
  await signInAs(page, "Cleo Approver");
  await page.goto(refundUrl);
  await page.getByRole("button", { name: "Approve" }).click();
  // The decision form disappears once the refund is no longer pending.
  await expect(page.getByTestId("refund-status")).toHaveText("paid");
  await expect(page.getByTestId("refund-approvals")).toHaveText("2 of 2 required");
  await signOut(page);

  // The auditor sees every step.
  await signInAs(page, "Aldo Auditor");
  await page.goto(`/audit?f_entityId=${refundId}&sort=at&dir=asc`);
  const actions = await page.locator("tbody tr td:nth-child(3)").allInnerTexts();
  expect(actions).toEqual(["refund.create", "approval.denied", "refund.approve", "refund.approve", "refund.paid"]);
});
