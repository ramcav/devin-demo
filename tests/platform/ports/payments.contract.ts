import { describe, expect, it } from "vitest";
import { SIMULATED } from "@/platform/adapters/payments/fixtures";
import {
  ChargeNotFound,
  PaymentDeclined,
  ProviderUnavailable,
  RefundExceedsCharge,
  type PaymentsPort,
} from "@/platform/ports/payments";
import { uniqueId } from "../../helpers";

/**
 * Shared contract every payments adapter must pass. `make` must return an adapter whose provider serves the
 * synthetic charge fixtures, with a timeout shorter than the provider's simulated slow response.
 */
export function paymentsPortContract(name: string, make: () => PaymentsPort) {
  describe(`payments port contract: ${name}`, () => {
    it("lists seeded charges with a payment method token and last4 only", async () => {
      const list = await make().listCharges();
      expect(list.length).toBeGreaterThan(10);
      const c = list.find((x) => x.id === "ch_0001")!;
      expect(c.paymentMethodToken).toMatch(/^pm_/);
      expect(c.last4).toMatch(/^\d{4}$/);
      expect(Object.keys(c).sort()).toEqual(
        ["amountCents", "createdAt", "currency", "customerId", "customerName", "id", "last4", "paymentMethodToken"].sort(),
      );
    });

    it("gets a charge, and raises ChargeNotFound for an unknown one", async () => {
      const p = make();
      expect((await p.getCharge("ch_0002")).id).toBe("ch_0002");
      await expect(p.getCharge("ch_nope")).rejects.toBeInstanceOf(ChargeNotFound);
    });

    it("issues a refund to the charge's original payment method token", async () => {
      const p = make();
      const charge = await p.getCharge("ch_0003");
      const refund = await p.issueRefund({ chargeId: charge.id, amountCents: 1000, idempotencyKey: uniqueId("idem") });
      expect(refund).toMatchObject({ chargeId: charge.id, amountCents: 1000, paymentMethodToken: charge.paymentMethodToken });
      expect(refund.refundId).toBeTruthy();
    });

    it("is idempotent: the same key never refunds twice", async () => {
      const p = make();
      const charge = await p.getCharge("ch_0004");
      const key = uniqueId("idem");
      const first = await p.issueRefund({ chargeId: charge.id, amountCents: charge.amountCents, idempotencyKey: key });
      const again = await p.issueRefund({ chargeId: charge.id, amountCents: charge.amountCents, idempotencyKey: key });
      expect(again.refundId).toBe(first.refundId);
      // Fully refunded once: any further refund exceeds the charge.
      await expect(p.issueRefund({ chargeId: charge.id, amountCents: 1, idempotencyKey: uniqueId("idem") })).rejects.toBeInstanceOf(
        RefundExceedsCharge,
      );
    });

    it("raises RefundExceedsCharge when the refund is larger than what's left", async () => {
      const p = make();
      const charge = await p.getCharge("ch_0005");
      await expect(
        p.issueRefund({ chargeId: charge.id, amountCents: charge.amountCents + 1, idempotencyKey: uniqueId("idem") }),
      ).rejects.toBeInstanceOf(RefundExceedsCharge);
    });

    it("raises ChargeNotFound when refunding an unknown charge", async () => {
      await expect(make().issueRefund({ chargeId: "ch_nope", amountCents: 100, idempotencyKey: uniqueId("idem") })).rejects.toBeInstanceOf(
        ChargeNotFound,
      );
    });

    it("raises PaymentDeclined when the provider declines", async () => {
      await expect(
        make().issueRefund({ chargeId: SIMULATED.decline, amountCents: 100, idempotencyKey: uniqueId("idem") }),
      ).rejects.toBeInstanceOf(PaymentDeclined);
    });

    it("raises ProviderUnavailable when the provider is down", async () => {
      await expect(
        make().issueRefund({ chargeId: SIMULATED.unavailable, amountCents: 100, idempotencyKey: uniqueId("idem") }),
      ).rejects.toBeInstanceOf(ProviderUnavailable);
    });

    it("raises ProviderUnavailable when the provider times out", async () => {
      const started = Date.now();
      await expect(
        make().issueRefund({ chargeId: SIMULATED.slow, amountCents: 100, idempotencyKey: uniqueId("idem") }),
      ).rejects.toBeInstanceOf(ProviderUnavailable);
      expect(Date.now() - started).toBeLessThan(5000);
    });
  });
}
