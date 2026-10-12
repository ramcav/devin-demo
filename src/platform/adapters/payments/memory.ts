import type { PaymentsPort } from "../../ports/payments";
import { toCharge, toDomainError, toIssuedRefund, withTimeout } from "./mapping";
import { MockPaymentsProvider, ProviderHttpError, memoryStore } from "./mock-provider";

export type MemoryPaymentsOptions = { timeoutMs?: number; slowMs?: number };

/** In-process mock: same provider logic as /api/mock-payments, state in memory. Used by app tests. */
export function createMemoryPaymentsAdapter(opts: MemoryPaymentsOptions = {}): PaymentsPort {
  const provider = new MockPaymentsProvider(memoryStore(), { slowMs: opts.slowMs });
  const timeoutMs = opts.timeoutMs ?? 5000;

  async function call<T>(fn: () => Promise<T>, chargeId?: string): Promise<T> {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (err) {
      if (err instanceof ProviderHttpError) throw toDomainError(err.status, err.code, chargeId);
      throw err;
    }
  }

  return {
    listCharges: () => call(async () => (await provider.listCharges()).map(toCharge)),
    getCharge: (chargeId) => call(async () => toCharge(await provider.getCharge(chargeId)), chargeId),
    issueRefund: ({ chargeId, amountCents, idempotencyKey }) =>
      call(async () => toIssuedRefund(await provider.createRefund({ charge: chargeId, amount: amountCents, idempotencyKey })), chargeId),
  };
}
