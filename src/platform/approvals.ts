import type { DbOrTx, Tx } from "./db/client";
import type { ApprovalDecision } from "./db/schema";
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

async function decide(
  _tx: Tx,
  _subject: ApprovalSubject,
  _approver: User,
  _decision: ApprovalDecision,
  _reason?: string | null,
): Promise<ApprovalState> {
  throw new Error("not implemented");
}

async function state(_db: DbOrTx, _subject: ApprovalSubject): Promise<ApprovalState> {
  throw new Error("not implemented");
}

export const approvals = { decide, state };
