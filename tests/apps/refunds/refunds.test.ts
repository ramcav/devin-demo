import { and, asc, eq, gte, notInArray } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as approveRoute } from "@/app/api/refunds/[id]/approve/route";
import { GET as getRefundRoute } from "@/app/api/refunds/[id]/route";
import { POST as createRoute, GET as listRoute } from "@/app/api/refunds/route";
import { charges, refundRequests } from "@/apps/refunds/schema";
import { createRefund, decideRefund, retryRefundPayment } from "@/apps/refunds/service";
import { getDb } from "@/platform/db/client";
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
});
