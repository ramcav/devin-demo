import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { approvals, type ApprovalSubject } from "@/platform/approvals";
import { audit } from "@/platform/audit";
import { getDb } from "@/platform/db/client";
import { approvals as approvalsTable, type ApprovalDecision } from "@/platform/db/schema";
import { ApprovalDeniedError } from "@/platform/errors";
import type { User } from "@/platform/ports/auth";
import { auditRowsFor, uniqueId, users } from "../helpers";

const ENTITY = "test_item";

function subject(createdBy: User, requiredApprovals = 1): ApprovalSubject {
  return { entityType: ENTITY, entityId: uniqueId("item"), createdBy: createdBy.id, requiredApprovals };
}

/** Runs a decision the way apps do: one audited transaction per decision. */
function decide(s: ApprovalSubject, approver: User, decision: ApprovalDecision = "approve") {
  return audit.change(approver, { action: `test_item.${decision}`, entityType: s.entityType, entityId: s.entityId }, async (tx) => {
    const result = await approvals.decide(tx, s, approver, decision, decision === "reject" ? "not ok" : null);
    return { result, before: null, after: { status: result.status, approvals: result.approvals } };
  });
}

async function storedDecisions(s: ApprovalSubject) {
  return getDb()
    .select()
    .from(approvalsTable)
    .where(and(eq(approvalsTable.entityType, s.entityType), eq(approvalsTable.entityId, s.entityId)));
}

describe("approvals engine", () => {
  it("INV-1: a user can't approve an item they created", async () => {
    const s = subject(users.approverA);
    const err = await decide(s, users.approverA).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApprovalDeniedError);
    expect((err as ApprovalDeniedError).reason).toBe("self_approval");
    expect((err as ApprovalDeniedError).status).toBe(403);
    expect(await storedDecisions(s)).toHaveLength(0);
    expect((await approvals.state(getDb(), s)).status).toBe("pending");
  });

  it("INV-1: the creator can't reject their own item either", async () => {
    const s = subject(users.approverA);
    await expect(decide(s, users.approverA, "reject")).rejects.toMatchObject({ reason: "self_approval" });
    expect(await storedDecisions(s)).toHaveLength(0);
  });

  it("INV-1: a blocked self-approval is recorded as approval.denied in the audit log", async () => {
    const s = subject(users.approverA);
    await decide(s, users.approverA).catch(() => undefined);
    const rows = await auditRowsFor(ENTITY, s.entityId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "approval.denied", actorId: users.approverA.id, reason: "self_approval" });
  });

  it("INV-2: the same user can't approve the same item twice", async () => {
    const s = subject(users.requester, 2);
    await decide(s, users.approverA);
    const err = await decide(s, users.approverA).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApprovalDeniedError);
    expect((err as ApprovalDeniedError).reason).toBe("already_decided");
    const state = await approvals.state(getDb(), s);
    expect(state).toMatchObject({ status: "pending", approvals: 1, required: 2 });
    const actions = (await auditRowsFor(ENTITY, s.entityId)).map((r) => r.action);
    expect(actions).toEqual(["test_item.approve", "approval.denied"]);
  });

  it("INV-2: concurrent double approval by the same user counts once", async () => {
    const s = subject(users.requester, 2);
    const results = await Promise.allSettled([decide(s, users.approverA), decide(s, users.approverA)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await storedDecisions(s)).toHaveLength(1);
    expect((await approvals.state(getDb(), s)).approvals).toBe(1);
  });

  it("an item is approved only once it has the required number of distinct approvals", async () => {
    const s = subject(users.requester, 2);
    expect((await decide(s, users.approverA)).status).toBe("pending");
    expect((await decide(s, users.approverB)).status).toBe("approved");
    await expect(decide(s, users.approverC)).rejects.toMatchObject({ reason: "not_pending" });
  });

  it("one rejection rejects the item", async () => {
    const s = subject(users.requester, 2);
    await decide(s, users.approverA);
    expect((await decide(s, users.approverB, "reject")).status).toBe("rejected");
    await expect(decide(s, users.approverC)).rejects.toMatchObject({ reason: "not_pending" });
    expect((await approvals.state(getDb(), s)).status).toBe("rejected");
  });
});
