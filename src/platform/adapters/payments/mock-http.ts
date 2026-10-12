import { PaymentsError, ProviderUnavailable, type PaymentsPort } from "../../ports/payments";
import { toCharge, toDomainError, toIssuedRefund } from "./mapping";
import type { VendorCharge, VendorRefund } from "./mock-provider";

export type MockHttpPaymentsOptions = {
  baseUrl: string;
  timeoutMs?: number;
  /** Extra attempts after a ProviderUnavailable. Safe for writes because every refund carries an idempotency key. */
  retries?: number;
  fetch?: typeof fetch;
};

/** Talks to the in-repo mock provider (/api/mock-payments) over HTTP, like a real processor adapter would. */
export function createMockHttpPaymentsAdapter(opts: MockHttpPaymentsOptions): PaymentsPort {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const retries = opts.retries ?? 2;

  async function once<T>(path: string, init: RequestInit, chargeId?: string): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(`${opts.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      throw new ProviderUnavailable(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
    }
    if (res.ok) return (await res.json()) as T;
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
    throw toDomainError(res.status, body.error?.code ?? "unknown", chargeId);
  }

  async function request<T>(path: string, init: RequestInit, chargeId?: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await once<T>(path, init, chargeId);
      } catch (err) {
        if (!(err instanceof ProviderUnavailable) || attempt >= retries) throw err;
        await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
      }
    }
  }

  return {
    async listCharges() {
      return (await request<{ data: VendorCharge[] }>("/charges", { method: "GET" })).data.map(toCharge);
    },
    async getCharge(chargeId) {
      return toCharge(await request<VendorCharge>(`/charges/${encodeURIComponent(chargeId)}`, { method: "GET" }, chargeId));
    },
    async issueRefund({ chargeId, amountCents, idempotencyKey }) {
      if (!idempotencyKey) throw new PaymentsError("idempotency_key_required", "Refunds need an idempotency key");
      const refund = await request<VendorRefund>(
        "/refunds",
        {
          method: "POST",
          headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
          body: JSON.stringify({ charge: chargeId, amount: amountCents }),
        },
        chargeId,
      );
      return toIssuedRefund(refund);
    },
  };
}
