import type { PaymentsPort } from "../../ports/payments";

export type MemoryPaymentsOptions = { timeoutMs?: number; slowMs?: number };

export function createMemoryPaymentsAdapter(_opts: MemoryPaymentsOptions = {}): PaymentsPort {
  throw new Error("not implemented");
}
