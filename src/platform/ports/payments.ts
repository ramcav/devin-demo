/** Payments port: what the apps need from a payment processor, in domain terms. No vendor types. */

export type Charge = {
  id: string;
  customerId: string;
  customerName: string;
  amountCents: number;
  currency: string;
  paymentMethodToken: string;
  last4: string;
  createdAt: string;
};

/** A refund always goes back to the charge's original payment method, so there is no destination field. */
export type RefundInstruction = {
  chargeId: string;
  amountCents: number;
  idempotencyKey: string;
};

export type IssuedRefund = {
  refundId: string;
  chargeId: string;
  amountCents: number;
  currency: string;
  paymentMethodToken: string;
};

export interface PaymentsPort {
  listCharges(): Promise<Charge[]>;
  getCharge(chargeId: string): Promise<Charge>;
  issueRefund(instruction: RefundInstruction): Promise<IssuedRefund>;
}

export class PaymentsError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = new.target.name;
  }
}

export class ChargeNotFound extends PaymentsError {
  constructor(chargeId: string) {
    super("charge_not_found", `Charge ${chargeId} not found`);
  }
}

export class RefundExceedsCharge extends PaymentsError {
  constructor() {
    super("refund_exceeds_charge", "Refund exceeds the refundable amount of the charge");
  }
}

export class PaymentDeclined extends PaymentsError {
  constructor() {
    super("payment_declined", "The payment provider declined the refund");
  }
}

export class ProviderUnavailable extends PaymentsError {
  constructor(detail = "unavailable") {
    super("provider_unavailable", `Payment provider unavailable (${detail})`);
  }
}
