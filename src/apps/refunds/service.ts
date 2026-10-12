import type { GridParams } from "@/platform/grid";
import type { User } from "@/platform/ports/auth";

export type RefundDecision = "approve" | "reject";

export async function listRefunds(_user: User | null, _params: GridParams): Promise<{ rows: unknown[]; total: number }> {
  throw new Error("not implemented");
}
export async function listChargesForRefund(_user: User | null, _params: GridParams): Promise<{ rows: unknown[]; total: number }> {
  throw new Error("not implemented");
}
export async function getRefund(_user: User | null, _id: string): Promise<Record<string, unknown>> {
  throw new Error("not implemented");
}
export async function createRefund(_user: User | null, _input: unknown): Promise<{ id: string; status: string; requiredApprovals: number }> {
  throw new Error("not implemented");
}
export async function decideRefund(
  _user: User | null,
  _id: string,
  _decision: RefundDecision,
  _reason?: string | null,
): Promise<{ id: string; status: string }> {
  throw new Error("not implemented");
}
export async function retryRefundPayment(_user: User | null, _id: string): Promise<{ id: string; status: string }> {
  throw new Error("not implemented");
}

export const refundGridSpec = { sortable: ["createdAt"], filterable: {}, defaultSort: "createdAt", defaultDir: "desc" } as const;
export const chargeGridSpec = { sortable: ["createdAt"], filterable: {}, defaultSort: "createdAt", defaultDir: "desc" } as const;
