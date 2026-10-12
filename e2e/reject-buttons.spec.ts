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

// The decide actions reject a missing decision, so these prove the Reject buttons actually send "reject".
test("Refunds: clicking Reject rejects the refund", async ({ page }) => {
  await signInAs(page, "Ana Approver");
  await page.goto("/refunds/new?sort=remainingCents&dir=desc");
  await page.getByRole("link", { name: /^Select ch_/ }).first().click();
  await page.getByLabel("Amount (USD)").fill("10");
  await page.getByLabel("Reason").fill("Reject button check (synthetic)");
  await page.getByRole("button", { name: "Submit refund request" }).click();
  await expect(page).toHaveURL(/\/refunds\/rf_/);
  const refundUrl = page.url();
  await signOut(page);

  await signInAs(page, "Ben Approver");
  await page.goto(refundUrl);
  await page.getByLabel("Reason (required to reject)").fill("Not eligible (synthetic)");
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByTestId("refund-status")).toHaveText("rejected");
  await expect(page.getByTestId("decisions")).toContainText("Rejected by Ben Approver");
});

test("KYC: clicking Reject on a pending proposal sends it back to review", async ({ page }) => {
  await signInAs(page, "Kim Reviewer");
  // Last low-risk NEW case, so this doesn't race kyc-flow.spec.ts, which takes the first rows.
  const res = await page.request.get("/api/kyc/cases?f_status=new&f_riskLevel=low");
  expect(res.status()).toBe(200);
  const { rows } = (await res.json()) as { rows: { id: string }[] };
  const caseId = rows.at(-1)!.id;
  expect((await page.request.post(`/api/kyc/cases/${caseId}/claim`, { data: {} })).status()).toBe(200);
  const proposed = await page.request.post(`/api/kyc/cases/${caseId}/propose`, {
    data: { decision: "reject", reason: "Documents expired (synthetic)" },
  });
  expect(proposed.status()).toBe(200);
  await signOut(page);

  await signInAs(page, "Cora Compliance");
  await page.goto(`/kyc/${caseId}`);
  await page.getByTestId("kyc-decision-reason").fill("Documents are valid (synthetic)");
  await page.getByTestId("kyc-decision-reject").click();
  await expect(page.getByTestId("kyc-decisions")).toContainText("Rejected by Cora Compliance");
  await expect(page.getByTestId("kyc-status")).toHaveText("in review");
  await expect(page.getByTestId("kyc-pending-decision")).toHaveCount(0);
});
