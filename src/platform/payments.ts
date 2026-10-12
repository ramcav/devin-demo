import { createMemoryPaymentsAdapter } from "./adapters/payments/memory";
import { createMockHttpPaymentsAdapter } from "./adapters/payments/mock-http";
import type { PaymentsPort } from "./ports/payments";

export * from "./ports/payments";

const globalForPayments = globalThis as unknown as { __payments?: PaymentsPort };

/** The configured payments adapter (PAYMENTS_ADAPTER=mock|memory). Apps use this, never an adapter directly. */
export function getPayments(): PaymentsPort {
  if (!globalForPayments.__payments) {
    const adapter = process.env.PAYMENTS_ADAPTER ?? "mock";
    const timeoutMs = Number(process.env.PAYMENTS_TIMEOUT_MS ?? 5000);
    switch (adapter) {
      case "mock":
        globalForPayments.__payments = createMockHttpPaymentsAdapter({
          baseUrl: process.env.MOCK_PAYMENTS_BASE_URL ?? "http://localhost:3000/api/mock-payments",
          timeoutMs,
        });
        break;
      case "memory":
        globalForPayments.__payments = createMemoryPaymentsAdapter({ timeoutMs });
        break;
      default:
        throw new Error(`Unsupported PAYMENTS_ADAPTER: ${adapter}`);
    }
  }
  return globalForPayments.__payments;
}
