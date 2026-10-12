import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Storage for the simulated payment provider behind /api/mock-payments. Not app data: apps never read these tables.
export const mockPaymentsCharges = pgTable("mock_payments_charges", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  customerName: text("customer_name").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  pmToken: text("pm_token").notNull(),
  last4: text("last4").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const mockPaymentsRefunds = pgTable(
  "mock_payments_refunds",
  {
    id: text("id").primaryKey(),
    chargeId: text("charge_id")
      .notNull()
      .references(() => mockPaymentsCharges.id),
    amountCents: integer("amount_cents").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    pmToken: text("pm_token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mock_payments_refunds_charge_idx").on(t.chargeId)],
);
