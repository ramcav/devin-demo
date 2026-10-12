export const APPROVAL_THRESHOLD_CENTS = 50_000;

/** SPEC: $500 or less → 1 approval; more than $500 → 2 distinct approvals. */
export function requiredApprovalsFor(amountCents: number): number {
  return amountCents > APPROVAL_THRESHOLD_CENTS ? 2 : 1;
}
