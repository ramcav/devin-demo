import type { PaymentsPort } from "../../ports/payments";

export type MockHttpPaymentsOptions = {
  baseUrl: string;
  timeoutMs?: number;
  retries?: number;
  fetch?: typeof fetch;
};

export function createMockHttpPaymentsAdapter(_opts: MockHttpPaymentsOptions): PaymentsPort {
  throw new Error("not implemented");
}
