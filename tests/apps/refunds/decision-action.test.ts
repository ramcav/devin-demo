import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decideRefundAction } from "@/apps/refunds/actions";
import { charges, refundRequests } from "@/apps/refunds/schema";
import { getDb } from "@/platform/db/client";
import { approvals } from "@/platform/db/schema";
import type { User } from "@/platform/ports/auth";
import { auditRowsFor, uniqueId, users } from "../../helpers";

const session = vi.hoisted(() => ({ user: null as User | null }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/platform/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/auth")>()),
  getCurrentUser: async () => session.user,
}));

/** A pending refund on its own fixture charge, so no other test's balances are touched. */
async function insertPendingRefund() {
  const chargeId = uniqueId("ch_t");
  await getDb().insert(charges).values({
    id: chargeId,
    customerId: uniqueId("cus_t"),
    customerName: "Test Customer",
    amountCents: 10_000,
    currency: "USD",
    paymentMethodToken: uniqueId("pm_t"),
    last4: "4242",
    createdAt: new Date(),
  });
  const [row] = await getDb()
    .insert(refundRequests)
    .values({ id: uniqueId("rf_t"), chargeId, amountCents: 5_000, currency: "USD", reason: "Test", requiredApprovals: 1, createdBy: users.requester.id })
    .returning();
  return row!;
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  session.user = users.approverA;
});

describe("refunds decide action: strict decision parsing", () => {
  it.each([
    ["a missing decision", {}],
    ["an unknown decision", { decision: "approved" }],
    ["a differently cased decision", { decision: "Approve" }],
  ])("rejects %s with a validation error and never approves", async (_label, fields: Record<string, string>) => {
    const refund = await insertPendingRefund();
    const result = await decideRefundAction({}, form({ id: refund.id, ...fields }));

    expect(result).toEqual({ error: 'Decision must be "approve" or "reject"' });
    const [row] = await getDb().select().from(refundRequests).where(eq(refundRequests.id, refund.id));
    expect(row!.status).toBe("pending");
    expect(await getDb().select().from(approvals).where(eq(approvals.entityId, refund.id))).toEqual([]);
    expect(await auditRowsFor("refund_request", refund.id)).toEqual([]);
  });

  it("still accepts an exact decision", async () => {
    const refund = await insertPendingRefund();
    const result = await decideRefundAction({}, form({ id: refund.id, decision: "reject", reason: "Not eligible" }));
    expect(result).toEqual({ message: "Refund is now rejected" });
  });
});
