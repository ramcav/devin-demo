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

/** First case matching the filters via the API, so repeated runs against the same DB still work. */
async function firstCase(page: Page, query: string): Promise<{ id: string }> {
  const res = await page.request.get(`/api/kyc/cases?${query}`);
  expect(res.status()).toBe(200);
  const { rows } = (await res.json()) as { rows: { id: string }[] };
  expect(rows.length).toBeGreaterThan(0);
  return rows[0]!;
}

test("KYC queue: claim, four-eyes rejection, escalation confidentiality", async ({ page }) => {
  // Kim claims a fresh NEW high-risk case and proposes a rejection.
  await signInAs(page, "Kim Reviewer");
  const { id: caseId } = await firstCase(page, "f_status=new&f_riskLevel=high");
  await page.goto(`/kyc/${caseId}`);
  await page.getByTestId("kyc-claim").click();
  await expect(page.getByTestId("kyc-status")).toHaveText("in review");
  await page.getByTestId("kyc-propose-decision").selectOption("reject");
  await page.getByTestId("kyc-propose-reason").fill("Name does not match the identity documents (synthetic)");
  await page.getByTestId("kyc-propose-submit").click();
  await expect(page.getByTestId("kyc-status")).toHaveText("in review");
  await expect(page.getByTestId("kyc-pending-decision")).toBeVisible();
  await signOut(page);

  // Cora sees the pending decision and approves it: the case is rejected.
  await signInAs(page, "Cora Compliance");
  await page.goto(`/kyc/${caseId}`);
  await expect(page.getByTestId("kyc-decision-approve")).toBeEnabled();
  await page.getByTestId("kyc-decision-approve").click();
  await expect(page.getByTestId("kyc-status")).toHaveText("rejected");

  // Self-approval check through the API: Cora proposes, then can't decide her own proposal.
  const { id: selfCase } = await firstCase(page, "f_status=new");
  const claimed = await page.request.post(`/api/kyc/cases/${selfCase}/claim`, { data: {} });
  expect(claimed.status()).toBe(200);
  const proposed = await page.request.post(`/api/kyc/cases/${selfCase}/propose`, {
    data: { decision: "reject", reason: "Duplicate customer record (synthetic)" },
  });
  expect(proposed.status()).toBe(200);
  const selfApproval = await page.request.post(`/api/kyc/cases/${selfCase}/decision/approve`, { data: {} });
  expect(selfApproval.status()).toBe(403);
  expect((await selfApproval.json()).error).toBe("approval_denied:self_approval");
  await signOut(page);

  // Kim claims another fresh case and escalates it.
  await signInAs(page, "Kim Reviewer");
  const { id: escalatedId } = await firstCase(page, "f_status=new&f_riskLevel=medium");
  await page.goto(`/kyc/${escalatedId}`);
  await page.getByTestId("kyc-claim").click();
  await page.getByTestId("kyc-escalate-note").fill("Possible sanctions-list match needs compliance review (synthetic)");
  await page.getByTestId("kyc-escalate-submit").click();
  // Even the escalating reviewer sees the case only as in review.
  await expect(page.getByTestId("kyc-status")).toHaveText("in review");
  await signOut(page);

  // Kai (another reviewer): in review, no escalation wording anywhere, masked national ID.
  await signInAs(page, "Kai Reviewer");
  await page.goto(`/kyc/${escalatedId}`);
  await expect(page.getByTestId("kyc-status")).toHaveText("in review");
  await expect(page.locator("main")).not.toContainText(/escalat/i);
  const masked = await page.getByTestId("kyc-national-id").innerText();
  expect(masked).toMatch(/^•••• \d{4}$/);
  await signOut(page);

  // Cora: the real status, the escalation note and the full synthetic national ID.
  await signInAs(page, "Cora Compliance");
  await page.goto(`/kyc/${escalatedId}`);
  await expect(page.getByTestId("kyc-status")).toHaveText("escalated");
  await expect(page.getByTestId("kyc-notes")).toContainText("Possible sanctions-list match");
  const fullId = await page.getByTestId("kyc-national-id").innerText();
  expect(fullId).toMatch(/^SYN\d{9}$/);
  expect(masked).toBe(`•••• ${fullId.slice(-4)}`);
});
