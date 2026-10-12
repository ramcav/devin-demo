import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decideKycProposalAction } from "@/apps/kyc/actions";
import { kycDecisions } from "@/apps/kyc/schema";
import { claimKycCase, proposeKycDecision } from "@/apps/kyc/service";
import { getDb } from "@/platform/db/client";
import { approvals } from "@/platform/db/schema";
import type { User } from "@/platform/ports/auth";
import { auditRowsFor, users } from "../../helpers";
import { insertKycCase, kycCaseRow } from "./helpers";

const session = vi.hoisted(() => ({ user: null as User | null }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/platform/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/auth")>()),
  getCurrentUser: async () => session.user,
}));

/** A case with a pending high-risk approve proposal awaiting compliance. */
async function caseWithPendingProposal() {
  const row = await insertKycCase({ riskLevel: "high" });
  await claimKycCase(users.kycReviewer, row.id);
  await proposeKycDecision(users.kycReviewer, row.id, { decision: "approve", reason: "Documents verified" });
  const [proposal] = await getDb()
    .select()
    .from(kycDecisions)
    .where(and(eq(kycDecisions.caseId, row.id), eq(kycDecisions.status, "pending")));
  return { id: row.id, proposalId: proposal!.id };
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  session.user = users.compliance;
});

describe("KYC decide action: strict decision parsing", () => {
  it.each([
    ["a missing decision", {}],
    ["an unknown decision", { decision: "approved" }],
    ["a differently cased decision", { decision: "Approve" }],
  ])("rejects %s with a validation error and never approves", async (_label, fields: Record<string, string>) => {
    const { id, proposalId } = await caseWithPendingProposal();
    const auditBefore = await auditRowsFor("kyc_case", id);

    const result = await decideKycProposalAction({}, form({ id, ...fields }));

    expect(result).toEqual({ error: 'Decision must be "approve" or "reject"' });
    expect((await kycCaseRow(id)).status).toBe("in_review");
    const [proposal] = await getDb().select().from(kycDecisions).where(eq(kycDecisions.id, proposalId));
    expect(proposal!.status).toBe("pending");
    expect(await getDb().select().from(approvals).where(eq(approvals.entityId, proposalId))).toEqual([]);
    expect(await auditRowsFor("kyc_case", id)).toEqual(auditBefore);
  });

  it("still accepts an exact decision", async () => {
    const { id } = await caseWithPendingProposal();
    const result = await decideKycProposalAction({}, form({ id, decision: "approve" }));
    expect(result).toEqual({ message: "Case is now approved" });
  });
});
