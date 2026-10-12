import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx, Tx } from "./db/client";
import { approvals as approvalsTable, type ApprovalDecision } from "./db/schema";
import { ApprovalDeniedError } from "./errors";
import type { User } from "./ports/auth";

export type ApprovalSubject = {
  entityType: string;
  entityId: string;
  createdBy: string;
  requiredApprovals: number;
};

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type ApprovalRecord = { approverId: string; decision: ApprovalDecision; reason: string | null; at: Date };

export type ApprovalState = {
  status: ApprovalStatus;
  approvals: number;
  required: number;
  decisions: ApprovalRecord[];
};

async function state(db: DbOrTx, subject: ApprovalSubject): Promise<ApprovalState> {
  const decisions = await db
    .select({
      approverId: approvalsTable.approverId,
      decision: approvalsTable.decision,
      reason: approvalsTable.reason,
      at: approvalsTable.at,
    })
    .from(approvalsTable)
    .where(and(eq(approvalsTable.entityType, subject.entityType), eq(approvalsTable.entityId, subject.entityId)))
    .orderBy(asc(approvalsTable.at), asc(approvalsTable.id));
  const approvals = new Set(decisions.filter((d) => d.decision === "approve").map((d) => d.approverId)).size;
  const status: ApprovalStatus = decisions.some((d) => d.decision === "reject")
    ? "rejected"
    : approvals >= subject.requiredApprovals
      ? "approved"
      : "pending";
  return { status, approvals, required: subject.requiredApprovals, decisions };
}

/**
 * Records one maker-checker decision. Callers authorize the approver and apply their own status change
 * (from the returned state) in the same transaction.
 */
async function decide(
  tx: Tx,
  subject: ApprovalSubject,
  approver: User,
  decision: ApprovalDecision,
  reason?: string | null,
): Promise<ApprovalState> {
  // Serialize decisions per item so concurrent approvals can't double count.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${subject.entityType}:${subject.entityId}`}, 0))`);
  const current = await state(tx, subject);
  if (approver.id === subject.createdBy) throw new ApprovalDeniedError("self_approval");
  if (current.decisions.some((d) => d.approverId === approver.id)) throw new ApprovalDeniedError("already_decided");
  if (current.status !== "pending") throw new ApprovalDeniedError("not_pending");
  await tx.insert(approvalsTable).values({
    entityType: subject.entityType,
    entityId: subject.entityId,
    approverId: approver.id,
    decision,
    reason: reason ?? null,
  });
  return state(tx, subject);
}

/** Approval counts for many items of one type (list views). */
async function counts(db: DbOrTx, entityType: string, entityIds: string[]): Promise<Map<string, number>> {
  if (entityIds.length === 0) return new Map();
  const rows = await db
    .select({ entityId: approvalsTable.entityId, n: sql<number>`count(*)::int` })
    .from(approvalsTable)
    .where(and(eq(approvalsTable.entityType, entityType), inArray(approvalsTable.entityId, entityIds), eq(approvalsTable.decision, "approve")))
    .groupBy(approvalsTable.entityId);
  return new Map(rows.map((r) => [r.entityId, r.n]));
}

export const approvals = { decide, state, counts };
