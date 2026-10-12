import { approvalDecisions, type ApprovalDecision } from "./db/schema";
import { ValidationError } from "./errors";

/** Parses a maker-checker decision from user input. Only exactly "approve" or "reject" is accepted; anything else is a 400. */
export function parseDecision(value: unknown): ApprovalDecision {
  const match = approvalDecisions.find((d) => d === value);
  if (!match) throw new ValidationError('Decision must be "approve" or "reject"');
  return match;
}
