import { pgTable, text } from "drizzle-orm/pg-core";

export const roles = ["requester", "approver", "kyc_reviewer", "compliance", "auditor", "admin"] as const;
export type Role = (typeof roles)[number];

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role", { enum: roles }).notNull(),
});
