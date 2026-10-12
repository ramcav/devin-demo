import { and, asc, desc, eq, gte, notInArray } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as approveRoute } from "@/app/api/refunds/[id]/approve/route";
import { GET as getRefundRoute } from "@/app/api/refunds/[id]/route";
import { GET as exportRoute } from "@/app/api/refunds/export/route";
import { POST as createRoute, GET as listRoute } from "@/app/api/refunds/route";
import { charges, refundRequests } from "@/apps/refunds/schema";
import { createRefund, decideRefund, exportRefunds, retryRefundPayment } from "@/apps/refunds/service";
import { getDb } from "@/platform/db/client";
import { auditLog } from "@/platform/db/schema";
import { ApprovalDeniedError, ForbiddenError, ValidationError } from "@/platform/errors";
import { getPayments, ProviderUnavailable } from "@/platform/payments";
import { apiRequest, auditRowsFor, routeCtx, users } from "../../helpers";

const ENTITY = "refund_request";

async function chargeRow(id: string) {
  const [row] = await getDb().select().from(charges).where(eq(charges.id, id));
  if (!row) throw new Error(`no charge ${id}`);
  return row;
}

async function refundRow(id: string) {
  const [row] = await getDb().select().from(refundRequests).where(eq(refundRequests.id, id));
  if (!row) throw new Error(`no refund ${id}`);
  return row;
}

const usedCharges = new Set<string>(Array.from({ length: 21 }, (_, i) => `ch_${String(i + 10).padStart(4, "0")}`));

/** A charge no other test touches, large enough for the refund under test. */
async function freshCharge(minCents: number): Promise<string> {
  const [row] = await getDb()
    .select({ id: charges.id })
    .from(charges)
    .where(and(gte(charges.amountCents, minCents), notInArray(charges.id, [...usedCharges]), eq(charges.currency, "USD")))
    .orderBy(asc(charges.id))
    .limit(1);
  if (!row || row.id.startsWith("ch_sim")) throw new Error(`no unused charge >= ${minCents}`);
  usedCharges.add(row.id);
  return row.id;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("refunds", () => {
  describe("INV-3: approval thresholds", () => {
    it("INV-3: refunds over $500 stay pending until two distinct approvers approve", async () => {
      const r = await createRefund(users.requester, { chargeId: await freshCharge(50_001), amountCents: 50_001, reason: "Damaged goods" });
      expect(r).toMatchObject({ status: "pending", requiredApprovals: 2 });

      expect((await decideRefund(users.approverA, r.id, "approve")).status).toBe("pending");
      expect((await refundRow(r.id)).status).toBe("pending");

      expect((await decideRefund(users.approverB, r.id, "approve")).status).toBe("paid");
      expect((await refundRow(r.id)).status).toBe("paid");
    });

    it("INV-3: refunds of $500 or less need one approval", async () => {
      const r = await createRefund(users.requester, { chargeId: await freshCharge(50_000), amountCents: 50_000, reason: "Late delivery" });
      expect(r.requiredApprovals).toBe(1);
      expect((await decideRefund(users.approverA, r.id, "approve")).status).toBe("paid");
    });

    it("INV-3: one approver approving twice does not count as two approvals", async () => {
      const r = await createRefund(users.requester, { chargeId: await freshCharge(75_000), amountCents: 75_000, reason: "Duplicate charge" });
      await decideRefund(users.approverA, r.id, "approve");
      await expect(decideRefund(users.approverA, r.id, "approve")).rejects.toBeInstanceOf(ApprovalDeniedError);
      expect((await refundRow(r.id)).status).toBe("pending");
    });

    it("one rejection rejects the refund and requires a reason", async () => {
      const r = await createRefund(users.requester, { chargeId: await freshCharge(75_000), amountCents: 75_000, reason: "Customer request" });
      await expect(decideRefund(users.approverA, r.id, "reject")).rejects.toBeInstanceOf(ValidationError);
      await decideRefund(users.approverA, r.id, "approve");
      expect((await decideRefund(users.approverB, r.id, "reject", "Not eligible")).status).toBe("rejected");
      await expect(decideRefund(users.approverC, r.id, "approve")).rejects.toBeInstanceOf(ApprovalDeniedError);
    });
  });

  describe("INV-1 / INV-2 for refunds", () => {
    it("INV-1: an approver who created a refund can't approve it (approvals engine, via the API)", async () => {
      const r = await createRefund(users.approverA, { chargeId: await freshCharge(75_000), amountCents: 75_000, reason: "Goodwill" });
      const res = await approveRoute(await apiRequest(`/api/refunds/${r.id}/approve`, { method: "POST", asUser: users.approverA.id, body: {} }), routeCtx({ id: r.id }));
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: string }).error).toBe("approval_denied:self_approval");
      expect((await refundRow(r.id)).status).toBe("pending");
      const denied = (await auditRowsFor(ENTITY, r.id)).filter((row) => row.action === "approval.denied");
      expect(denied).toHaveLength(1);
      expect(denied[0]).toMatchObject({ actorId: users.approverA.id, reason: "self_approval" });
    });

    it("INV-2: the same approver can't approve the same refund twice (via the API)", async () => {
      const r = await createRefund(users.requester, { chargeId: await freshCharge(75_000), amountCents: 75_000, reason: "Goodwill" });
      const call = async () =>
        approveRoute(await apiRequest(`/api/refunds/${r.id}/approve`, { method: "POST", asUser: users.approverB.id, body: {} }), routeCtx({ id: r.id }));
      expect((await call()).status).toBe(200);
      const second = await call();
      expect(second.status).toBe(409);
      expect(((await second.json()) as { error: string }).error).toBe("approval_denied:already_decided");
    });
  });

  describe("INV-4: refundable amount", () => {
    it("INV-4: a refund can't exceed the charge amount", async () => {
      const charge = await chargeRow("ch_0016");
      await expect(
        createRefund(users.requester, { chargeId: charge.id, amountCents: charge.amountCents + 1, reason: "Too much" }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("INV-4: a refund can't exceed what's left after other refunds (pending ones are reserved)", async () => {
      const charge = await chargeRow("ch_0017");
      const half = Math.floor(charge.amountCents / 2);
      await createRefund(users.requester, { chargeId: charge.id, amountCents: half, reason: "First half" });
      const remaining = charge.amountCents - half;
      await expect(
        createRefund(users.requester2, { chargeId: charge.id, amountCents: remaining + 1, reason: "Over" }),
      ).rejects.toBeInstanceOf(ValidationError);
      const exact = await createRefund(users.requester2, { chargeId: charge.id, amountCents: remaining, reason: "Exactly the rest" });
      expect(exact.status).toBe("pending");
      await expect(createRefund(users.requester, { chargeId: charge.id, amountCents: 1, reason: "One cent" })).rejects.toBeInstanceOf(ValidationError);
    });

    it("INV-4: a rejected refund releases its amount", async () => {
      const charge = await chargeRow("ch_0018");
      const r = await createRefund(users.requester, { chargeId: charge.id, amountCents: charge.amountCents, reason: "Full" });
      await decideRefund(users.approverA, r.id, "reject", "Wrong charge");
      const again = await createRefund(users.requester, { chargeId: charge.id, amountCents: charge.amountCents, reason: "Full, again" });
      expect(again.status).toBe("pending");
    });

    it("INV-4: zero, negative and fractional-cent amounts are rejected", async () => {
      for (const amountCents of [0, -100, 10.5]) {
        await expect(createRefund(users.requester, { chargeId: "ch_0019", amountCents, reason: "Bad amount" })).rejects.toBeInstanceOf(
          ValidationError,
        );
      }
    });

    it("INV-4: the API returns 400 for an amount over the remaining balance", async () => {
      const charge = await chargeRow("ch_0020");
      const res = await createRoute(
        await apiRequest("/api/refunds", {
          method: "POST",
          asUser: users.requester.id,
          body: { chargeId: charge.id, amountCents: charge.amountCents + 100, reason: "Over" },
        }),
        routeCtx({}),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("INV-5: original payment method", () => {
    it("INV-5: a refund is issued to the charge's original payment method token", async () => {
      const charge = await chargeRow("ch_0021");
      const spy = vi.spyOn(getPayments(), "issueRefund");
      const r = await createRefund(users.requester, { chargeId: charge.id, amountCents: 1_000, reason: "Partial" });
      await decideRefund(users.approverA, r.id, "approve");
      expect(spy).toHaveBeenCalledTimes(1);
      expect(Object.keys(spy.mock.calls[0]![0]).sort()).toEqual(["amountCents", "chargeId", "idempotencyKey"]);
      const row = await refundRow(r.id);
      expect(row.status).toBe("paid");
      expect(row.paidToPaymentMethodToken).toBe(charge.paymentMethodToken);
      expect(row.providerRefundId).toBeTruthy();
    });

    it("INV-5: the API rejects any attempt to choose a refund destination", async () => {
      const res = await createRoute(
        await apiRequest("/api/refunds", {
          method: "POST",
          asUser: users.requester.id,
          body: { chargeId: "ch_0022", amountCents: 1_000, reason: "Redirect", paymentMethodToken: "pm_attacker" },
        }),
        routeCtx({}),
      );
      expect(res.status).toBe(400);
    });

    it("INV-5: if the provider pays a different token, the refund is not marked paid", async () => {
      const r = await createRefund(users.requester, { chargeId: "ch_0023", amountCents: 1_000, reason: "Partial" });
      vi.spyOn(getPayments(), "issueRefund").mockResolvedValueOnce({
        refundId: "re_evil",
        chargeId: "ch_0023",
        amountCents: 1_000,
        currency: "USD",
        paymentMethodToken: "pm_somewhere_else",
      });
      expect((await decideRefund(users.approverA, r.id, "approve")).status).toBe("payment_failed");
      const row = await refundRow(r.id);
      expect(row).toMatchObject({ status: "payment_failed", failureReason: "destination_mismatch", paidToPaymentMethodToken: null });
    });

    it("API responses only expose the masked card, never the payment method token", async () => {
      const r = await createRefund(users.requester, { chargeId: "ch_0024", amountCents: 1_000, reason: "Partial" });
      const charge = await chargeRow("ch_0024");
      const res = await getRefundRoute(await apiRequest(`/api/refunds/${r.id}`, { asUser: users.auditor.id }), routeCtx({ id: r.id }));
      const text = await res.text();
      expect(res.status).toBe(200);
      expect(text).toContain(`•••• ${charge.last4}`);
      expect(text).not.toContain(charge.paymentMethodToken);
    });
  });

  describe("payments failures", () => {
    it("a provider failure leaves the refund payment_failed, and a retry pays it once", async () => {
      const r = await createRefund(users.requester, { chargeId: "ch_0025", amountCents: 2_000, reason: "Retry me" });
      const spy = vi.spyOn(getPayments(), "issueRefund");
      spy.mockRejectedValueOnce(new ProviderUnavailable("test"));
      expect((await decideRefund(users.approverA, r.id, "approve")).status).toBe("payment_failed");
      expect((await retryRefundPayment(users.approverB, r.id)).status).toBe("paid");
      expect(spy.mock.calls.map((c) => c[0].idempotencyKey)).toEqual([r.id, r.id]);
    });
  });

  describe("INV-6 for refunds", () => {
    it("INV-6: create, each approval and payment each write exactly one audit row", async () => {
      const r = await createRefund(users.approverA, { chargeId: await freshCharge(75_000), amountCents: 75_000, reason: "Full trail" });
      expect((await auditRowsFor(ENTITY, r.id)).map((x) => x.action)).toEqual(["refund.create"]);
      await decideRefund(users.approverB, r.id, "approve");
      expect((await auditRowsFor(ENTITY, r.id)).map((x) => x.action)).toEqual(["refund.create", "refund.approve"]);
      await decideRefund(users.approverC, r.id, "approve");
      const rows = await auditRowsFor(ENTITY, r.id);
      expect(rows.map((x) => x.action)).toEqual(["refund.create", "refund.approve", "refund.approve", "refund.paid"]);
      expect(rows[3]!.after).toMatchObject({ status: "paid", providerRefundId: expect.stringMatching(/^re_/) });
      expect(rows[2]).toMatchObject({ before: { status: "pending" }, after: { status: "approved", approvals: 2 } });
    });
  });

  describe("INV-8 for refunds", () => {
    it("INV-8: a requester gets 403 approving a refund via the API", async () => {
      const r = await createRefund(users.requester2, { chargeId: "ch_0027", amountCents: 1_000, reason: "Mine" });
      const res = await approveRoute(await apiRequest(`/api/refunds/${r.id}/approve`, { method: "POST", asUser: users.requester.id, body: {} }), routeCtx({ id: r.id }));
      expect(res.status).toBe(403);
      expect((await auditRowsFor(ENTITY, r.id)).map((x) => x.action)).toEqual(["refund.create", "authz.denied"]);
    });

    it("INV-8: an auditor gets 403 creating a refund via the API", async () => {
      const res = await createRoute(
        await apiRequest("/api/refunds", { method: "POST", asUser: users.auditor.id, body: { chargeId: "ch_0028", amountCents: 100, reason: "x" } }),
        routeCtx({}),
      );
      expect(res.status).toBe(403);
    });

    it("INV-8: a requester can't view someone else's refund, and only lists their own", async () => {
      const theirs = await createRefund(users.requester2, { chargeId: "ch_0029", amountCents: 1_000, reason: "Theirs" });
      await expect(
        getRefundRoute(await apiRequest(`/api/refunds/${theirs.id}`, { asUser: users.requester.id }), routeCtx({ id: theirs.id })).then((r) => r.status),
      ).resolves.toBe(403);
      const res = await listRoute(await apiRequest("/api/refunds?pageSize=100", { asUser: users.requester.id }), routeCtx({}));
      const body = (await res.json()) as { rows: { createdBy: { id: string } }[] };
      expect(body.rows.length).toBeGreaterThan(0);
      expect(body.rows.every((row) => row.createdBy.id === users.requester.id)).toBe(true);
    });

    it("INV-8: kyc reviewers and admins can't create refunds", async () => {
      for (const u of [users.kycReviewer, users.admin, users.compliance]) {
        await expect(createRefund(u, { chargeId: "ch_0030", amountCents: 100, reason: "x" })).rejects.toBeInstanceOf(ForbiddenError);
      }
    });
  });

  describe("CSV export", () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    function parseCsv(text: string): string[][] {
      const rows: string[][] = [];
      let row: string[] = [];
      let cell = "";
      let quoted = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i]!;
        if (quoted) {
          if (c === '"' && text[i + 1] === '"') {
            cell += '"';
            i++;
          } else if (c === '"') quoted = false;
          else cell += c;
        } else if (c === '"') quoted = true;
        else if (c === ",") {
          row.push(cell);
          cell = "";
        } else if (c === "\r" && text[i + 1] === "\n") {
          row.push(cell);
          rows.push(row);
          row = [];
          cell = "";
          i++;
        } else cell += c;
      }
      return rows;
    }

    async function download(asUser: string | undefined, query: string) {
      const res = await exportRoute(await apiRequest(`/api/refunds/export?${query}`, { asUser }), routeCtx({}));
      return res;
    }

    async function exportedRows(asUser: string, query: string): Promise<Record<string, string>[]> {
      const res = await download(asUser, query);
      expect(res.status).toBe(200);
      const [header, ...rows] = parseCsv((await res.text()).replace(/^\uFEFF/, ""));
      return rows.map((r) => Object.fromEntries(header!.map((h, i) => [h, r[i] ?? ""])));
    }

    it("an approver downloads refunds with requester, both approvers, paid date and decimal amount", async () => {
      const r = await createRefund(users.requester, { chargeId: await freshCharge(60_000), amountCents: 60_050, reason: "Month-end, item lost" });
      await decideRefund(users.approverA, r.id, "approve");
      await decideRefund(users.approverB, r.id, "approve");

      const res = await download(users.approverC.id, `from=${today}&to=${today}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
      expect(res.headers.get("content-disposition")).toBe(`attachment; filename="refunds_${today}_${today}.csv"`);
      const text = await res.text();
      expect(text).not.toContain("pm_");

      const rows = await exportedRows(users.approverC.id, `from=${today}&to=${today}`);
      const row = rows.find((x) => x.refund_id === r.id);
      expect(row).toMatchObject({
        status: "paid",
        amount: "600.50",
        currency: "USD",
        reason: "Month-end, item lost",
        requested_by: "Rita Requester",
        approved_by: "Ana Approver; Ben Approver",
        rejected_by: "",
        provider_refund_id: expect.stringMatching(/^re_/),
        paid_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
      expect(Object.keys(row!)).toEqual([
        "refund_id", "created_at", "paid_at", "status", "amount", "currency", "reason",
        "requested_by", "approved_by", "rejected_by", "charge_id", "provider_refund_id",
      ]);
    });

    it("an auditor can download; rejections show who rejected; status and date filters apply", async () => {
      const r = await createRefund(users.requester2, { chargeId: await freshCharge(70_000), amountCents: 70_000, reason: "Not delivered" });
      await decideRefund(users.approverA, r.id, "approve");
      await decideRefund(users.approverB, r.id, "reject", "Delivered per carrier");

      const rejected = await exportedRows(users.auditor.id, `from=${today}&to=${today}&status=rejected`);
      expect(rejected.find((x) => x.refund_id === r.id)).toMatchObject({ approved_by: "Ana Approver", rejected_by: "Ben Approver", paid_at: "" });
      expect(rejected.every((x) => x.status === "rejected")).toBe(true);

      expect((await exportedRows(users.auditor.id, `from=${today}&to=${today}&status=paid`)).some((x) => x.refund_id === r.id)).toBe(false);
      expect((await exportedRows(users.auditor.id, `from=${yesterday}&to=${yesterday}`)).some((x) => x.refund_id === r.id)).toBe(false);
    });

    it("free-text reasons can't inject spreadsheet formulas", async () => {
      const r = await createRefund(users.requester, { chargeId: await freshCharge(1_000), amountCents: 1_000, reason: '=HYPERLINK("http://evil.test","x")' });
      const res = await download(users.auditor.id, `from=${today}&to=${today}`);
      const text = await res.text();
      expect(text).toContain(`"'=HYPERLINK(""http://evil.test"",""x"")"`);
      const row = (await exportedRows(users.auditor.id, `from=${today}&to=${today}`)).find((x) => x.refund_id === r.id);
      expect(row!.reason).toBe(`'=HYPERLINK("http://evil.test","x")`);
    });

    it("each export writes one refund.exported audit row with the filters and row count, not the data", async () => {
      const { rows } = await exportRefunds(users.approverB, { from: yesterday, to: today, status: "pending" });
      const [last] = await getDb()
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.action, "refund.exported"), eq(auditLog.actorId, users.approverB.id)))
        .orderBy(desc(auditLog.id))
        .limit(1);
      expect(last).toMatchObject({ actorRole: "approver", entityType: "refund_export", after: { from: yesterday, to: today, status: "pending", rowCount: rows.length } });
      expect(last!.entityId).toMatch(/^rx_/);
    });

    it("INV-8: a requester gets 403 downloading the CSV via the API, and the denial is audited", async () => {
      const res = await download(users.requester.id, `from=${today}&to=${today}`);
      expect(res.status).toBe(403);
      const rows = await auditRowsFor("action", "refund.export");
      expect(rows.at(-1)).toMatchObject({ action: "authz.denied", actorId: users.requester.id });
    });

    it("INV-8: only approvers and auditors can export; no session gets 401", async () => {
      for (const u of [users.requester2, users.kycReviewer, users.compliance, users.admin]) {
        await expect(exportRefunds(u, { from: today, to: today })).rejects.toBeInstanceOf(ForbiddenError);
      }
      expect((await download(undefined, `from=${today}&to=${today}`)).status).toBe(401);
    });

    it("requires a valid from/to date range", async () => {
      for (const q of ["", `from=${today}`, "from=2026-02-30&to=2026-03-01", "from=2026-03-02&to=2026-03-01", "from=03/01/2026&to=2026-03-02", "from=2026-03-01&to=2026-03-02&status=bogus"]) {
        const res = await download(users.auditor.id, q);
        expect(res.status, q).toBe(400);
      }
    });
  });
});
