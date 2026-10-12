import {
  ChargeNotFound,
  PaymentDeclined,
  PaymentsError,
  ProviderUnavailable,
  RefundExceedsCharge,
  type Charge,
  type IssuedRefund,
} from "../../ports/payments";
import type { VendorCharge, VendorRefund } from "./mock-provider";

export function toCharge(v: VendorCharge): Charge {
  return {
    id: v.id,
    customerId: v.customer.id,
    customerName: v.customer.name,
    amountCents: v.amount,
    currency: v.currency.toUpperCase(),
    paymentMethodToken: v.payment_method.id,
    last4: v.payment_method.card.last4,
    createdAt: v.created,
  };
}

export function toIssuedRefund(v: VendorRefund): IssuedRefund {
  return {
    refundId: v.id,
    chargeId: v.charge,
    amountCents: v.amount,
    currency: v.currency.toUpperCase(),
    paymentMethodToken: v.payment_method,
  };
}

/** Vendor HTTP status / error code → port domain error. */
export function toDomainError(status: number, code: string, chargeId?: string): PaymentsError {
  if (status === 404) return new ChargeNotFound(chargeId ?? "unknown");
  if (status === 400 && code === "amount_too_large") return new RefundExceedsCharge();
  if (status === 402) return new PaymentDeclined();
  if (status >= 500 || status === 429) return new ProviderUnavailable(`http ${status}`);
  return new PaymentsError("provider_error", `Payment provider rejected the request (${code})`);
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ProviderUnavailable("timeout")), timeoutMs);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
