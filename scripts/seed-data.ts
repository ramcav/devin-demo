import { kycCases, kycDecisions, kycNotes, type KycCaseStatus, type KycRiskLevel } from "../src/apps/kyc/schema";
import { charges } from "../src/apps/refunds/schema";
import { chargeFixtures } from "../src/platform/adapters/payments/fixtures";
import { seedMockPaymentsProvider } from "../src/platform/adapters/payments/mock-provider";
import type { Db } from "../src/platform/db/client";
import { seed as seedPlatform } from "../src/platform/db/seed";
import { approvals as approvalsTable } from "../src/platform/db/schema";

const KIM = "u_kyc_1";
const KAI = "u_kyc_2";
const CORA = "u_cmp_1";

const FIRST = ["Marta", "Jonas", "Priya", "Tomás", "Ingrid", "Daan", "Sofia", "Lars", "Amara", "Nils", "Elena", "Ruben", "Freya", "Omar"];
const LAST = ["Ellison", "Vermeer", "Kowalski", "Serrano", "Lindqvist", "Bakker", "Moreau", "Haugen", "Diallo", "Nyström", "Ferrara", "Visser"];
const COUNTRIES = ["NL", "DE", "FR", "ES", "IT", "BE"];

type SeedCase = {
  status: KycCaseStatus;
  risk: KycRiskLevel;
  assignedTo?: string;
  decision?: { decision: "approve" | "reject"; requiredApprovals: number; status: "pending" | "approved"; proposedBy: string };
  escalate?: boolean;
};

const BASE = new Date("2026-01-05T09:00:00Z").getTime();
const day = 86_400_000;

const cases: { index: number; spec: SeedCase }[] = [];
const spec = (index: number, s: SeedCase) => cases.push({ index, spec: s });

// Reserved for walkthrough/e2e: six fresh HIGH-risk cases.
for (let i = 1; i <= 6; i++) spec(i, { status: "new", risk: "high" });
// Remaining new cases (18 total).
const newRest: KycRiskLevel[] = ["low", "medium", "high", "low", "medium", "medium", "high", "low", "medium", "low", "medium", "high"];
newRest.forEach((risk, i) => spec(7 + i, { status: "new", risk }));
// In review, split between Kim and Kai; three carry a pending decision (one high approve, two rejects).
const inReview: (SeedCase & { i: number })[] = [
  { i: 19, status: "in_review", risk: "high", assignedTo: KIM, decision: { decision: "approve", requiredApprovals: 1, status: "pending", proposedBy: KIM } },
  { i: 20, status: "in_review", risk: "medium", assignedTo: KAI, decision: { decision: "reject", requiredApprovals: 1, status: "pending", proposedBy: KAI } },
  { i: 21, status: "in_review", risk: "low", assignedTo: KIM, decision: { decision: "reject", requiredApprovals: 1, status: "pending", proposedBy: KIM } },
  { i: 22, status: "in_review", risk: "medium", assignedTo: KAI },
  { i: 23, status: "in_review", risk: "low", assignedTo: KIM },
  { i: 24, status: "in_review", risk: "high", assignedTo: KAI },
  { i: 25, status: "in_review", risk: "medium", assignedTo: KIM },
  { i: 26, status: "in_review", risk: "low", assignedTo: KAI },
  { i: 27, status: "in_review", risk: "medium", assignedTo: KIM },
  { i: 28, status: "in_review", risk: "high", assignedTo: KAI },
  { i: 29, status: "in_review", risk: "low", assignedTo: KIM },
  { i: 30, status: "in_review", risk: "medium", assignedTo: KAI },
  { i: 31, status: "in_review", risk: "low", assignedTo: KIM },
  { i: 32, status: "in_review", risk: "high", assignedTo: KAI },
];
inReview.forEach(({ i, ...s }) => spec(i, s));
// Escalated, still assigned to the escalating reviewer (each gets an escalation note).
const escalated: SeedCase[] = [
  { status: "escalated", risk: "high", assignedTo: KIM, escalate: true },
  { status: "escalated", risk: "medium", assignedTo: KAI, escalate: true },
  { status: "escalated", risk: "high", assignedTo: KIM, escalate: true },
  { status: "escalated", risk: "medium", assignedTo: KAI, escalate: true },
  { status: "escalated", risk: "high", assignedTo: KIM, escalate: true },
];
escalated.forEach((s, i) => spec(33 + i, s));
// Approved: direct approvals (requiredApprovals 0) and compliance-approved high-risk ones.
const approved: SeedCase[] = [
  { status: "approved", risk: "low", decision: { decision: "approve", requiredApprovals: 0, status: "approved", proposedBy: KIM } },
  { status: "approved", risk: "medium", decision: { decision: "approve", requiredApprovals: 0, status: "approved", proposedBy: KAI } },
  { status: "approved", risk: "low", decision: { decision: "approve", requiredApprovals: 0, status: "approved", proposedBy: KIM } },
  { status: "approved", risk: "medium", decision: { decision: "approve", requiredApprovals: 0, status: "approved", proposedBy: KAI } },
  { status: "approved", risk: "high", decision: { decision: "approve", requiredApprovals: 1, status: "approved", proposedBy: KIM } },
  { status: "approved", risk: "high", decision: { decision: "approve", requiredApprovals: 1, status: "approved", proposedBy: KAI } },
  { status: "approved", risk: "high", decision: { decision: "approve", requiredApprovals: 1, status: "approved", proposedBy: KIM } },
];
approved.forEach((s, i) => spec(38 + i, s));
// Rejected: every rejection needed the compliance approval.
const rejected: SeedCase[] = [
  { status: "rejected", risk: "low" },
  { status: "rejected", risk: "medium" },
  { status: "rejected", risk: "high" },
  { status: "rejected", risk: "medium" },
  { status: "rejected", risk: "low" },
  { status: "rejected", risk: "high" },
];
rejected.forEach((s, i) =>
  spec(45 + i, { ...s, decision: { decision: "reject", requiredApprovals: 1, status: "approved", proposedBy: i % 2 === 0 ? KIM : KAI } }),
);

/** Idempotent seed for local dev, Compose and tests. All data is synthetic. */
export async function seedAll(db: Db): Promise<void> {
  await seedPlatform(db);
  // The simulated provider's own data…
  await seedMockPaymentsProvider(db);
  // …and the Refunds app's local mirror of those charges.
  await db
    .insert(charges)
    .values(
      chargeFixtures.map((c) => ({
        id: c.id,
        customerId: c.customerId,
        customerName: c.customerName,
        amountCents: c.amountCents,
        currency: c.currency,
        paymentMethodToken: c.pmToken,
        last4: c.last4,
        createdAt: new Date(c.createdAt),
      })),
    )
    .onConflictDoNothing();

  // KYC review queue fixtures: deterministic, synthetic identities only.
  await db
    .insert(kycCases)
    .values(
      cases.map(({ index, spec }) => ({
        id: `kyc_${String(index).padStart(4, "0")}`,
        customerName: `${FIRST[(index - 1) % FIRST.length]} ${LAST[Math.floor((index - 1) / FIRST.length) % LAST.length]}`,
        nationalId: `SYN${String(200_000_000 + index * 7_777)}`,
        dateOfBirth: `${1958 + (index % 42)}-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}`,
        country: COUNTRIES[index % COUNTRIES.length]!,
        riskLevel: spec.risk,
        status: spec.status,
        assignedTo: spec.assignedTo ?? null,
        createdAt: new Date(BASE + index * day),
      })),
    )
    .onConflictDoNothing();

  const decisionRows = cases
    .filter((c) => c.spec.decision)
    .map(({ index, spec }) => {
      const d = spec.decision!;
      return {
        id: `kd_seed_${String(index).padStart(4, "0")}`,
        caseId: `kyc_${String(index).padStart(4, "0")}`,
        decision: d.decision,
        reason: d.decision === "reject" ? "Identity documents do not match (synthetic)" : "Identity verified (synthetic)",
        proposedBy: d.proposedBy,
        requiredApprovals: d.requiredApprovals,
        status: d.status,
        whileEscalated: false,
        createdAt: new Date(BASE + index * day + 3_600_000),
        decidedAt: d.status === "approved" ? new Date(BASE + index * day + 7_200_000) : null,
      };
    });
  if (decisionRows.length) await db.insert(kycDecisions).values(decisionRows).onConflictDoNothing();

  const complianceApprovals = decisionRows
    .filter((d) => d.requiredApprovals === 1 && d.status === "approved")
    .map((d) => ({
      entityType: "kyc_decision",
      entityId: d.id,
      approverId: CORA,
      decision: "approve" as const,
      reason: "Reviewed the evidence (synthetic)",
      at: d.decidedAt!,
    }));
  if (complianceApprovals.length) await db.insert(approvalsTable).values(complianceApprovals).onConflictDoNothing();

  const escalationNotes = cases
    .filter((c) => c.spec.escalate)
    .map(({ index, spec }) => ({
      caseId: `kyc_${String(index).padStart(4, "0")}`,
      authorId: spec.assignedTo!,
      kind: "escalation" as const,
      body: "Escalated for a second look: possible sanctions-list match (synthetic).",
      createdAt: new Date(BASE + index * day + 5_400_000),
    }));
  if (escalationNotes.length) await db.insert(kycNotes).values(escalationNotes).onConflictDoNothing();
}
