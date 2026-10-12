import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { approvals } from "@/platform/approvals";
import { audit } from "@/platform/audit";
import { getDb, type DbOrTx, type Tx } from "@/platform/db/client";
import { approvals as approvalsTable, users } from "@/platform/db/schema";
import { NotFoundError, ValidationError } from "@/platform/errors";
import { gridQuery, type GridParams, type GridSpec } from "@/platform/grid";
import { authorize, can } from "@/platform/policy";
import type { User } from "@/platform/ports/auth";
import { caseNotActionable, requiresComplianceApproval } from "./rules";
import {
  kycCases,
  kycDecisions,
  kycDecisionValues,
  kycNotes,
  type KycCaseStatus,
  type KycDecision,
  type KycNoteKind,
  type KycRiskLevel,
} from "./schema";

export const ENTITY = "kyc_case";

export type { KycDecision };

export type KycCaseView = {
  id: string;
  customerName: string;
  country: string;
  riskLevel: KycRiskLevel;
  /** Displayed status: "escalated" is shown as "in_review" to actors without kyc.escalation.view. */
  status: KycCaseStatus;
  assignedTo: { id: string; name: string } | null;
  /** Full national ID for kyc.pii.view actors, otherwise "•••• " + last 4. */
  nationalId: string;
  createdAt: string;
  awaitingCompliance: boolean;
};

export type KycNoteView = {
  id: number;
  author: { id: string; name: string };
  kind: KycNoteKind;
  body: string;
  createdAt: string;
};

export type KycDecisionView = {
  id: string;
  decision: KycDecision;
  reason: string;
  status: "pending" | "approved" | "rejected";
  proposedBy: { id: string; name: string };
  requiredApprovals: number;
  createdAt: string;
  decidedAt: string | null;
  approvals: { approverId: string; approverName: string; decision: KycDecision; reason: string | null; at: string }[];
};

export type KycPendingDecision = { id: string; decision: KycDecision; reason: string; proposedBy: { id: string; name: string } };

export type KycCaseActions = {
  claim: boolean;
  propose: boolean;
  escalate: boolean;
  addNote: boolean;
  decideProposal: boolean;
  isProposer: boolean;
};

export type KycCaseDetail = KycCaseView & {
  dateOfBirth: string;
  notes: KycNoteView[];
  decisions: KycDecisionView[];
  pendingDecision: KycPendingDecision | null;
  actions: KycCaseActions;
};

export type KycCaseSummary = { id: string; status: KycCaseStatus; pendingDecision: { id: string; decision: KycDecision } | null };

export type ProposeKycDecisionInput = { decision: KycDecision; reason: string };

export const kycGridSpec = {
  sortable: ["createdAt", "customerName", "riskLevel", "status", "country"],
  filterable: { id: "eq", status: "eq", riskLevel: "eq", country: "eq", customerName: "contains", assignedTo: "eq" },
  defaultSort: "createdAt",
  defaultDir: "desc",
  pageSize: 20,
} as const satisfies GridSpec;

const proposeInput = z
  .object({
    decision: z.enum(kycDecisionValues),
    reason: z.string().trim().min(3, "reason is required").max(500),
  })
  .strict();

type CaseRow = typeof kycCases.$inferSelect;
type DecisionRow = typeof kycDecisions.$inferSelect;

function validationMessage(err: z.ZodError): string {
  return err.issues.map((i) => (i.code === "unrecognized_keys" ? i.message : `${i.path.join(".")}: ${i.message}`)).join("; ");
}

/**
 * The status expression an actor is allowed to see. For anyone without kyc.escalation.view,
 * "escalated" is folded into "in_review" in SQL so filters and sorts can't reveal it either.
 */
function statusExpr(actor: User): SQL<KycCaseStatus> {
  return can(actor, "kyc.escalation.view")
    ? sql<KycCaseStatus>`${kycCases.status}`
    : sql<KycCaseStatus>`case when ${kycCases.status} = 'escalated' then 'in_review' else ${kycCases.status} end`;
}

function displayedStatus(actor: User, raw: KycCaseStatus): KycCaseStatus {
  return can(actor, "kyc.escalation.view") ? raw : raw === "escalated" ? "in_review" : raw;
}

/** The full national ID is selected only for kyc.pii.view actors; everyone else gets a masked expression. */
function nationalIdExpr(actor: User) {
  return can(actor, "kyc.pii.view") ? kycCases.nationalId : sql<string>`'•••• ' || right(${kycCases.nationalId}, 4)`;
}

/** Whether the actor may perform work on the case right now (assignment or escalation authority). */
function mayWork(actor: User, row: CaseRow): boolean {
  return (
    (row.status === "in_review" && row.assignedTo === actor.id) ||
    (row.status === "escalated" && can(actor, "kyc.escalation.decide"))
  );
}

async function pendingDecision(tx: DbOrTx, caseId: string): Promise<DecisionRow | null> {
  const [row] = await tx
    .select()
    .from(kycDecisions)
    .where(and(eq(kycDecisions.caseId, caseId), eq(kycDecisions.status, "pending")));
  return row ?? null;
}

async function lockCase(tx: Tx, id: string): Promise<CaseRow> {
  const [row] = await tx.select().from(kycCases).where(eq(kycCases.id, id)).for("update");
  if (!row) throw new NotFoundError("Case not found");
  return row;
}

function summaryFor(
  actor: User,
  id: string,
  rawStatus: KycCaseStatus,
  pending: Pick<DecisionRow, "id" | "decision"> | null,
): KycCaseSummary {
  return {
    id,
    status: displayedStatus(actor, rawStatus),
    pendingDecision: pending ? { id: pending.id, decision: pending.decision } : null,
  };
}

const selectForActor = (actor: User) => ({
  kyc: kycCases,
  displayedStatus: statusExpr(actor),
  nationalId: nationalIdExpr(actor),
  assigneeName: users.name,
});

type CaseJoinRow = { kyc: CaseRow; displayedStatus: KycCaseStatus; nationalId: string; assigneeName: string | null };

function toView(r: CaseJoinRow, awaitingCompliance: boolean): KycCaseView {
  return {
    id: r.kyc.id,
    customerName: r.kyc.customerName,
    country: r.kyc.country,
    riskLevel: r.kyc.riskLevel,
    status: r.displayedStatus,
    assignedTo: r.kyc.assignedTo ? { id: r.kyc.assignedTo, name: r.assigneeName ?? r.kyc.assignedTo } : null,
    nationalId: r.nationalId,
    createdAt: r.kyc.createdAt.toISOString(),
    awaitingCompliance,
  };
}

export async function listKycCases(user: User | null, params: GridParams): Promise<{ rows: KycCaseView[]; total: number }> {
  const actor = await authorize(user, "kyc.case.list");
  const db = getDb();
  const status = statusExpr(actor);
  const canViewEscalations = can(actor, "kyc.escalation.view");
  // A pending while-escalated decision must not leak, so awaitingCompliance only counts visible proposals.
  const awaitingCompliance = canViewEscalations
    ? sql<boolean>`exists(select 1 from kyc_decisions d where d.case_id = ${kycCases.id} and d.status = 'pending')`
    : sql<boolean>`exists(select 1 from kyc_decisions d where d.case_id = ${kycCases.id} and d.status = 'pending' and d.while_escalated = false)`;
  const q = gridQuery(params, {
    createdAt: kycCases.createdAt,
    customerName: kycCases.customerName,
    riskLevel: kycCases.riskLevel,
    status,
    country: kycCases.country,
    id: kycCases.id,
    assignedTo: kycCases.assignedTo,
  });
  const [rows, [countRow]] = await Promise.all([
    db
      .select({ ...selectForActor(actor), awaitingCompliance })
      .from(kycCases)
      .leftJoin(users, eq(users.id, kycCases.assignedTo))
      .where(q.where)
      .orderBy(q.orderBy, kycCases.id)
      .limit(q.limit)
      .offset(q.offset),
    db.select({ n: sql<number>`count(*)::int` }).from(kycCases).where(q.where),
  ]);
  return { rows: rows.map((r) => toView(r, r.awaitingCompliance)), total: countRow?.n ?? 0 };
}

export async function getKycCase(user: User | null, id: string): Promise<KycCaseDetail> {
  const actor = await authorize(user, "kyc.case.view", { type: ENTITY, id });
  const db = getDb();
  const canViewEscalations = can(actor, "kyc.escalation.view");
  const [found] = await db
    .select(selectForActor(actor))
    .from(kycCases)
    .leftJoin(users, eq(users.id, kycCases.assignedTo))
    .where(eq(kycCases.id, id));
  if (!found) throw new NotFoundError("Case not found");
  const row = found.kyc;

  // Notes: escalation notes and anything written while the case was escalated (i.e. after the first
  // escalation note) are hidden from actors without kyc.escalation.view.
  const noteRows = await db
    .select({ note: kycNotes, authorName: users.name })
    .from(kycNotes)
    .innerJoin(users, eq(users.id, kycNotes.authorId))
    .where(eq(kycNotes.caseId, id))
    .orderBy(asc(kycNotes.id));
  const firstEscalationNoteId = noteRows.find((n) => n.note.kind === "escalation")?.note.id;
  const visibleNotes = canViewEscalations || firstEscalationNoteId === undefined
    ? noteRows
    : noteRows.filter((n) => n.note.id < firstEscalationNoteId);

  const decisionRows = await db
    .select({ decision: kycDecisions, proposerName: users.name })
    .from(kycDecisions)
    .innerJoin(users, eq(users.id, kycDecisions.proposedBy))
    .where(eq(kycDecisions.caseId, id))
    .orderBy(asc(kycDecisions.createdAt), asc(kycDecisions.id));
  const visibleDecisions = canViewEscalations ? decisionRows : decisionRows.filter((d) => !d.decision.whileEscalated);

  const decisionIds = visibleDecisions.map((d) => d.decision.id);
  const approvalRows = decisionIds.length
    ? await db
        .select({ approval: approvalsTable, approverName: users.name })
        .from(approvalsTable)
        .innerJoin(users, eq(users.id, approvalsTable.approverId))
        .where(and(eq(approvalsTable.entityType, "kyc_decision"), inArray(approvalsTable.entityId, decisionIds)))
        .orderBy(asc(approvalsTable.at), asc(approvalsTable.id))
    : [];
  const approvalsByDecision = new Map<string, KycDecisionView["approvals"]>();
  for (const { approval, approverName } of approvalRows) {
    const list = approvalsByDecision.get(approval.entityId) ?? [];
    list.push({
      approverId: approval.approverId,
      approverName,
      decision: approval.decision,
      reason: approval.reason,
      at: approval.at.toISOString(),
    });
    approvalsByDecision.set(approval.entityId, list);
  }

  const pending = visibleDecisions.find((d) => d.decision.status === "pending") ?? null;
  const actions: KycCaseActions = {
    claim: row.status === "new" && can(actor, "kyc.case.claim"),
    propose: mayWork(actor, row) && !pending && can(actor, "kyc.case.propose"),
    escalate: row.status === "in_review" && row.assignedTo === actor.id && !pending && can(actor, "kyc.case.escalate"),
    addNote: mayWork(actor, row) && can(actor, "kyc.note.add"),
    decideProposal:
      !!pending && can(actor, "kyc.decision.approve") && (row.status !== "escalated" || can(actor, "kyc.escalation.decide")),
    isProposer: pending?.decision.proposedBy === actor.id,
  };

  return {
    ...toView(found, !!pending),
    dateOfBirth: row.dateOfBirth,
    notes: visibleNotes.map(({ note, authorName }) => ({
      id: note.id,
      author: { id: note.authorId, name: authorName },
      kind: note.kind,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
    })),
    decisions: visibleDecisions.map(({ decision, proposerName }) => ({
      id: decision.id,
      decision: decision.decision,
      reason: decision.reason,
      status: decision.status,
      proposedBy: { id: decision.proposedBy, name: proposerName },
      requiredApprovals: decision.requiredApprovals,
      createdAt: decision.createdAt.toISOString(),
      decidedAt: decision.decidedAt?.toISOString() ?? null,
      approvals: approvalsByDecision.get(decision.id) ?? [],
    })),
    pendingDecision: pending
      ? {
          id: pending.decision.id,
          decision: pending.decision.decision,
          reason: pending.decision.reason,
          proposedBy: { id: pending.decision.proposedBy, name: pending.proposerName },
        }
      : null,
    actions,
  };
}

export async function claimKycCase(user: User | null, id: string): Promise<KycCaseSummary> {
  const actor = await authorize(user, "kyc.case.claim", { type: ENTITY, id });
  return audit.change(actor, { action: "kyc.case.claim", entityType: ENTITY, entityId: id }, async (tx) => {
    const row = await lockCase(tx, id);
    if (row.status !== "new") throw caseNotActionable();
    await tx.update(kycCases).set({ status: "in_review", assignedTo: actor.id }).where(eq(kycCases.id, id));
    return {
      result: summaryFor(actor, id, "in_review", null),
      before: { status: row.status },
      after: { status: "in_review", assignedTo: actor.id },
    };
  });
}

export async function addKycNote(user: User | null, id: string, body: string): Promise<{ id: number }> {
  const actor = await authorize(user, "kyc.note.add", { type: ENTITY, id });
  const trimmed = body.trim();
  if (trimmed.length < 1 || trimmed.length > 2000) throw new ValidationError("Note must be between 1 and 2000 characters");
  return audit.change(actor, { action: "kyc.note.add", entityType: ENTITY, entityId: id }, async (tx) => {
    const row = await lockCase(tx, id);
    if (!mayWork(actor, row)) throw caseNotActionable();
    const kind = row.status === "escalated" ? "escalation" : "note";
    const [note] = await tx.insert(kycNotes).values({ caseId: id, authorId: actor.id, kind, body: trimmed }).returning();
    return {
      result: { id: note!.id },
      before: { status: row.status },
      after: { kind, body: trimmed },
    };
  });
}

export async function escalateKycCase(user: User | null, id: string, note: string): Promise<KycCaseSummary> {
  const actor = await authorize(user, "kyc.case.escalate", { type: ENTITY, id });
  const trimmed = note.trim();
  if (!trimmed) throw new ValidationError("An escalation note is required");
  return audit.change(actor, { action: "kyc.case.escalate", entityType: ENTITY, entityId: id }, async (tx) => {
    const row = await lockCase(tx, id);
    if (!(row.status === "in_review" && row.assignedTo === actor.id)) throw caseNotActionable();
    if (await pendingDecision(tx, id)) throw caseNotActionable();
    await tx.update(kycCases).set({ status: "escalated" }).where(eq(kycCases.id, id));
    await tx.insert(kycNotes).values({ caseId: id, authorId: actor.id, kind: "escalation", body: trimmed });
    return {
      result: summaryFor(actor, id, "escalated", null),
      before: { status: row.status },
      after: { status: "escalated", note: trimmed },
    };
  });
}

export async function proposeKycDecision(user: User | null, id: string, input: ProposeKycDecisionInput): Promise<KycCaseSummary> {
  const actor = await authorize(user, "kyc.case.propose", { type: ENTITY, id });
  const parsed = proposeInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(validationMessage(parsed.error));
  const { decision, reason } = parsed.data;
  return audit.change(actor, { action: "kyc.decision.propose", entityType: ENTITY, entityId: id }, async (tx) => {
    const row = await lockCase(tx, id);
    if (!mayWork(actor, row)) throw caseNotActionable();
    if (await pendingDecision(tx, id)) throw caseNotActionable();
    const whileEscalated = row.status === "escalated";
    const decisionId = `kd_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    if (!requiresComplianceApproval(decision, row.riskLevel)) {
      await tx.insert(kycDecisions).values({
        id: decisionId,
        caseId: id,
        decision,
        reason,
        proposedBy: actor.id,
        requiredApprovals: 0,
        status: "approved",
        whileEscalated,
        decidedAt: new Date(),
      });
      await tx.update(kycCases).set({ status: "approved" }).where(eq(kycCases.id, id));
      return {
        result: summaryFor(actor, id, "approved", null),
        action: "kyc.case.approve",
        before: { status: row.status },
        after: { status: "approved", decision, decisionId },
      };
    }
    await tx.insert(kycDecisions).values({
      id: decisionId,
      caseId: id,
      decision,
      reason,
      proposedBy: actor.id,
      requiredApprovals: 1,
      status: "pending",
      whileEscalated,
    });
    return {
      result: summaryFor(actor, id, row.status, { id: decisionId, decision }),
      action: "kyc.decision.propose",
      before: { status: row.status },
      after: { status: row.status, decision, decisionId, proposalStatus: "pending" },
    };
  });
}

export async function decideKycProposal(
  user: User | null,
  id: string,
  decision: KycDecision,
  reason?: string | null,
): Promise<KycCaseSummary> {
  const actor = await authorize(user, "kyc.decision.approve", { type: ENTITY, id });
  const trimmed = reason?.trim() || null;
  if (decision === "reject" && !trimmed) throw new ValidationError("A reason is required to reject a proposal");
  return audit.change(actor, { action: `kyc.decision.${decision}`, entityType: ENTITY, entityId: id, reason: trimmed }, async (tx) => {
    const row = await lockCase(tx, id);
    if (row.status === "escalated" && !can(actor, "kyc.escalation.decide")) throw caseNotActionable();
    const decisions = await tx
      .select()
      .from(kycDecisions)
      .where(eq(kycDecisions.caseId, id))
      .orderBy(asc(kycDecisions.createdAt), asc(kycDecisions.id));
    // The pending proposal is the subject when there is one; otherwise the most recent proposal is
    // passed to the engine so it can deny repeat or late decisions (already_decided / not_pending).
    const pending = decisions.find((d) => d.status === "pending");
    const subject = pending ?? decisions[decisions.length - 1];
    if (!subject) throw caseNotActionable();
    const state = await approvals.decide(
      tx,
      { entityType: "kyc_decision", entityId: subject.id, createdBy: subject.proposedBy, requiredApprovals: 1 },
      actor,
      decision,
      trimmed,
    );
    if (state.status === "approved") {
      const nextStatus: KycCaseStatus = subject.decision === "approve" ? "approved" : "rejected";
      await tx.update(kycDecisions).set({ status: "approved", decidedAt: new Date() }).where(eq(kycDecisions.id, subject.id));
      await tx.update(kycCases).set({ status: nextStatus }).where(eq(kycCases.id, id));
      return {
        result: summaryFor(actor, id, nextStatus, null),
        action: "kyc.decision.approve",
        before: { status: row.status, proposalStatus: subject.status },
        after: { status: nextStatus, decision: subject.decision, decisionId: subject.id },
      };
    }
    await tx.update(kycDecisions).set({ status: "rejected", decidedAt: new Date() }).where(eq(kycDecisions.id, subject.id));
    return {
      result: summaryFor(actor, id, row.status, null),
      action: "kyc.decision.reject",
      before: { status: row.status, proposalStatus: subject.status },
      after: { status: row.status, proposalStatus: "rejected", decisionId: subject.id },
    };
  });
}
