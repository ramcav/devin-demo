import { bigserial, index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

export const roles = ["requester", "approver", "kyc_reviewer", "compliance", "auditor", "admin"] as const;
export type Role = (typeof roles)[number];

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role", { enum: roles }).notNull(),
});

// Append-only: UPDATE, DELETE and TRUNCATE are rejected by a trigger (see drizzle/0001_audit_log_append_only.sql).
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorId: text("actor_id").notNull(),
    actorRole: text("actor_role").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    requestId: text("request_id"),
  },
  (t) => [index("audit_log_entity_idx").on(t.entityType, t.entityId), index("audit_log_at_idx").on(t.at)],
);

export const approvalDecisions = ["approve", "reject"] as const;
export type ApprovalDecision = (typeof approvalDecisions)[number];

export const approvals = pgTable(
  "approvals",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    approverId: text("approver_id")
      .notNull()
      .references(() => users.id),
    decision: text("decision", { enum: approvalDecisions }).notNull(),
    reason: text("reason"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("approvals_one_decision_per_approver").on(t.entityType, t.entityId, t.approverId)],
);
