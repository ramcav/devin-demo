import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "@/platform/db/schema";

/** Local mirror of charges from the payments provider (refreshed through the payments port on every refund). */
export const charges = pgTable("charges", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  customerName: text("customer_name").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  paymentMethodToken: text("payment_method_token").notNull(),
  last4: text("last4").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const refundStatuses = ["pending", "approved", "rejected", "paid", "payment_failed"] as const;
export type RefundStatus = (typeof refundStatuses)[number];

/** Statuses whose amount counts against the charge's refundable balance. */
export const reservingStatuses: RefundStatus[] = ["pending", "approved", "paid", "payment_failed"];

export const refundRequests = pgTable(
  "refund_requests",
  {
    id: text("id").primaryKey(),
    chargeId: text("charge_id")
      .notNull()
      .references(() => charges.id),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    reason: text("reason").notNull(),
    status: text("status", { enum: refundStatuses }).notNull().default("pending"),
    requiredApprovals: integer("required_approvals").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    providerRefundId: text("provider_refund_id"),
    paidToPaymentMethodToken: text("paid_to_payment_method_token"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
  },
  (t) => [
    index("refund_requests_charge_idx").on(t.chargeId),
    index("refund_requests_created_by_idx").on(t.createdBy),
    check("refund_requests_amount_positive", sql`${t.amountCents} > 0`),
    check("refund_requests_required_approvals", sql`${t.requiredApprovals} in (1, 2)`),
  ],
);
