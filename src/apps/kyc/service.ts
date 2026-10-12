import type { GridParams, GridSpec } from "@/platform/grid";
import type { User } from "@/platform/ports/auth";
import type { KycCaseStatus, KycDecision, KycNoteKind, KycRiskLevel } from "./schema";

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

export async function listKycCases(user: User | null, params: GridParams): Promise<{ rows: KycCaseView[]; total: number }> {
  void user;
  void params;
  throw new Error("not implemented");
}

export async function getKycCase(user: User | null, id: string): Promise<KycCaseDetail> {
  void user;
  void id;
  throw new Error("not implemented");
}

export async function claimKycCase(user: User | null, id: string): Promise<KycCaseSummary> {
  void user;
  void id;
  throw new Error("not implemented");
}

export async function addKycNote(user: User | null, id: string, body: string): Promise<{ id: number }> {
  void user;
  void id;
  void body;
  throw new Error("not implemented");
}

export async function escalateKycCase(user: User | null, id: string, note: string): Promise<KycCaseSummary> {
  void user;
  void id;
  void note;
  throw new Error("not implemented");
}

export async function proposeKycDecision(user: User | null, id: string, input: ProposeKycDecisionInput): Promise<KycCaseSummary> {
  void user;
  void id;
  void input;
  throw new Error("not implemented");
}

export async function decideKycProposal(
  user: User | null,
  id: string,
  decision: KycDecision,
  reason?: string | null,
): Promise<KycCaseSummary> {
  void user;
  void id;
  void decision;
  void reason;
  throw new Error("not implemented");
}
