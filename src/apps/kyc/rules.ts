import { ConflictError } from "@/platform/errors";
import type { KycDecision, KycRiskLevel } from "./schema";

/** SPEC: rejecting always needs a second compliance approval; approving only for high-risk cases. */
export function requiresComplianceApproval(decision: KycDecision, riskLevel: KycRiskLevel): boolean {
  return decision === "reject" || riskLevel === "high";
}

/** The single refusal for every "you can't act on this case right now" case (INV-9/INV-10): leaks nothing. */
export function caseNotActionable(): ConflictError {
  return new ConflictError("case_not_actionable", "You can't change this case right now");
}
