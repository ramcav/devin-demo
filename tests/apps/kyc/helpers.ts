import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { kycCases, type KycCaseStatus, type KycRiskLevel } from "@/apps/kyc/schema";
import { getDb } from "@/platform/db/client";

type KycCaseOverrides = Partial<{
  riskLevel: KycRiskLevel;
  status: KycCaseStatus;
  assignedTo: string | null;
  nationalId: string;
  dateOfBirth: string;
  customerName: string;
}>;

/** Inserts a KYC case row directly (a fixture, not a state change) and returns it. */
export async function insertKycCase(overrides: KycCaseOverrides = {}) {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  const [row] = await getDb()
    .insert(kycCases)
    .values({
      id: `kyc_t_${suffix}`,
      customerName: overrides.customerName ?? `Casey Customer ${suffix}`,
      nationalId: overrides.nationalId ?? `SYN${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`,
      dateOfBirth: overrides.dateOfBirth ?? "1984-03-17",
      country: "NL",
      riskLevel: overrides.riskLevel ?? "medium",
      status: overrides.status ?? "new",
      assignedTo: overrides.assignedTo ?? null,
    })
    .returning();
  return row!;
}

export async function kycCaseRow(id: string) {
  const [row] = await getDb().select().from(kycCases).where(eq(kycCases.id, id));
  if (!row) throw new Error(`no kyc case ${id}`);
  return row;
}
