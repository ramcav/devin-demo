import type { Db } from "./client";
import { users, type Role } from "./schema";

export const seedUsers: { id: string; name: string; email: string; role: Role }[] = [
  { id: "u_req_1", name: "Rita Requester", email: "rita@example.test", role: "requester" },
  { id: "u_req_2", name: "Ravi Requester", email: "ravi@example.test", role: "requester" },
  { id: "u_app_1", name: "Ana Approver", email: "ana@example.test", role: "approver" },
  { id: "u_app_2", name: "Ben Approver", email: "ben@example.test", role: "approver" },
  { id: "u_app_3", name: "Cleo Approver", email: "cleo@example.test", role: "approver" },
  { id: "u_kyc_1", name: "Kim Reviewer", email: "kim@example.test", role: "kyc_reviewer" },
  { id: "u_kyc_2", name: "Kai Reviewer", email: "kai@example.test", role: "kyc_reviewer" },
  { id: "u_cmp_1", name: "Cora Compliance", email: "cora@example.test", role: "compliance" },
  { id: "u_aud_1", name: "Aldo Auditor", email: "aldo@example.test", role: "auditor" },
  { id: "u_adm_1", name: "Ada Admin", email: "ada@example.test", role: "admin" },
];

export async function seed(db: Db): Promise<void> {
  await db.insert(users).values(seedUsers).onConflictDoNothing();
}
