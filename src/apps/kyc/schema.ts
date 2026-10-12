import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "@/platform/db/schema";

export const kycRiskLevels = ["low", "medium", "high"] as const;
export type KycRiskLevel = (typeof kycRiskLevels)[number];

export const kycCaseStatuses = ["new", "in_review", "approved", "rejected", "escalated"] as const;
export type KycCaseStatus = (typeof kycCaseStatuses)[number];

export const kycNoteKinds = ["note", "escalation"] as const;
export type KycNoteKind = (typeof kycNoteKinds)[number];

export const kycDecisionValues = ["approve", "reject"] as const;
export type KycDecision = (typeof kycDecisionValues)[number];

export const kycDecisionStatuses = ["pending", "approved", "rejected"] as const;
export type KycDecisionStatus = (typeof kycDecisionStatuses)[number];

export const kycCases = pgTable(
  "kyc_cases",
  {
    id: text("id").primaryKey(),
    customerName: text("customer_name").notNull(),
    // Synthetic test data only: national IDs are "SYN" + 9 digits, never real identifiers.
    dateOfBirth: date("date_of_birth", { mode: "string" }).notNull(),
    nationalId: text("national_id").notNull(),
    country: text("country").notNull(),
    riskLevel: text("risk_level", { enum: kycRiskLevels }).notNull(),
    status: text("status", { enum: kycCaseStatuses }).notNull().default("new"),
    assignedTo: text("assigned_to").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("kyc_cases_status_idx").on(t.status), index("kyc_cases_assigned_to_idx").on(t.assignedTo)],
);

export const kycNotes = pgTable(
  "kyc_notes",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    caseId: text("case_id")
      .notNull()
      .references(() => kycCases.id),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind", { enum: kycNoteKinds }).notNull().default("note"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("kyc_notes_case_idx").on(t.caseId)],
);

export const kycDecisions = pgTable(
  "kyc_decisions",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => kycCases.id),
    decision: text("decision", { enum: kycDecisionValues }).notNull(),
    reason: text("reason").notNull(),
    proposedBy: text("proposed_by")
      .notNull()
      .references(() => users.id),
    requiredApprovals: integer("required_approvals").notNull(),
    status: text("status", { enum: kycDecisionStatuses }).notNull().default("pending"),
    whileEscalated: boolean("while_escalated").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    check("kyc_decisions_required_approvals", sql`${t.requiredApprovals} in (0, 1)`),
    uniqueIndex("kyc_decisions_one_pending_per_case").on(t.caseId).where(sql`${t.status} = 'pending'`),
  ],
);
