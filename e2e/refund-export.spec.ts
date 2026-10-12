import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await expect(page.getByTestId("current-user")).toContainText(name);
}

test("requesters can't export; the auditor downloads the refunds CSV", async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  const reason = `Month-end export check ${Date.now()} (synthetic)`;

  // A requester raises a refund, sees no export form and is refused by the API.
  await signInAs(page, "Rita Requester");
  const charges = await (await page.request.get("/api/charges?sort=remainingCents&dir=desc&pageSize=1")).json();
  const created = await page.request.post("/api/refunds", { data: { chargeId: charges.rows[0].id, amountCents: 1_234, reason } });
  expect(created.status()).toBe(201);
  const refundId = (await created.json()).id as string;
  await page.goto("/refunds");
  await expect(page.getByTestId("refund-export")).toHaveCount(0);
  const denied = await page.request.get(`/api/refunds/export?from=2020-01-01&to=${today}`);
  expect(denied.status()).toBe(403);
  await page.getByRole("button", { name: "Sign out" }).click();

  // The auditor downloads it.
  await signInAs(page, "Aldo Auditor");
  await page.goto("/refunds");
  const form = page.getByTestId("refund-export");
  await form.getByLabel("Created from (UTC)").fill("2020-01-01");
  await form.getByLabel("Created to (UTC)").fill(today);
  const downloadPromise = page.waitForEvent("download");
  await form.getByRole("button", { name: "Download CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`refunds_2020-01-01_${today}.csv`);
  const csv = (await readFile((await download.path())!, "utf8")).replace(/^\uFEFF/, "");
  const [header, ...rows] = csv.trimEnd().split("\r\n");
  expect(header).toBe("refund_id,created_at,paid_at,status,amount,currency,reason,requested_by,approved_by,rejected_by,charge_id,provider_refund_id");
  const row = rows.find((r) => r.startsWith(`${refundId},`));
  expect(row).toContain(`,pending,12.34,USD,${reason},Rita Requester,,,`);
  expect(csv).not.toContain("pm_");
});
