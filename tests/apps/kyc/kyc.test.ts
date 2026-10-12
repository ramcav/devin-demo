import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as approveRoute } from "@/app/api/kyc/cases/[id]/decision/approve/route";
import { POST as rejectRoute } from "@/app/api/kyc/cases/[id]/decision/reject/route";
import { POST as claimRoute } from "@/app/api/kyc/cases/[id]/claim/route";
import { POST as escalateRoute } from "@/app/api/kyc/cases/[id]/escalate/route";
import { GET as detailRoute } from "@/app/api/kyc/cases/[id]/route";
import { POST as notesRoute } from "@/app/api/kyc/cases/[id]/notes/route";
import { POST as proposeRoute } from "@/app/api/kyc/cases/[id]/propose/route";
import { GET as listRoute } from "@/app/api/kyc/cases/route";
import { kycDecisions, kycNotes } from "@/apps/kyc/schema";
import { claimKycCase, escalateKycCase } from "@/apps/kyc/service";
import { audit } from "@/platform/audit";
import { getDb } from "@/platform/db/client";
import { apiRequest, auditRowsFor, routeCtx, users } from "../../helpers";
import { insertKycCase, kycCaseRow } from "./helpers";

const ENTITY = "kyc_case";

type Actor = (typeof users)[keyof typeof users] | undefined;

async function list(actor: Actor, query = "") {
  return listRoute(await apiRequest(`/api/kyc/cases${query}`, { asUser: actor?.id }), routeCtx({}));
}

async function detail(id: string, actor: Actor) {
  return detailRoute(await apiRequest(`/api/kyc/cases/${id}`, { asUser: actor?.id }), routeCtx({ id }));
}

async function claim(id: string, actor: Actor) {
  return claimRoute(await apiRequest(`/api/kyc/cases/${id}/claim`, { method: "POST", asUser: actor?.id, body: {} }), routeCtx({ id }));
}

async function propose(id: string, actor: Actor, decision: "approve" | "reject", reason = "Review completed") {
  return proposeRoute(
    await apiRequest(`/api/kyc/cases/${id}/propose`, { method: "POST", asUser: actor?.id, body: { decision, reason } }),
    routeCtx({ id }),
  );
}

async function escalate(id: string, actor: Actor, note: string) {
  return escalateRoute(await apiRequest(`/api/kyc/cases/${id}/escalate`, { method: "POST", asUser: actor?.id, body: { note } }), routeCtx({ id }));
}

async function addNote(id: string, actor: Actor, body: string) {
  return notesRoute(await apiRequest(`/api/kyc/cases/${id}/notes`, { method: "POST", asUser: actor?.id, body: { body } }), routeCtx({ id }));
}

async function decide(id: string, actor: Actor, decision: "approve" | "reject", reason?: string) {
  const route = decision === "approve" ? approveRoute : rejectRoute;
  const path = decision === "approve" ? "approve" : "reject";
  return route(
    await apiRequest(`/api/kyc/cases/${id}/decision/${path}`, { method: "POST", asUser: actor?.id, body: reason === undefined ? {} : { reason } }),
    routeCtx({ id }),
  );
}

async function responseBody<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function setupEscalatedCase(riskLevel: "low" | "medium" | "high" = "high") {
  const marker = `Escalation marker ${randomUUID()}`;
  const row = await insertKycCase({ riskLevel });
  await claim(row.id, users.kycReviewer);
  const escalationResponse = await escalate(row.id, users.kycReviewer, marker);
  const escalationText = await escalationResponse.text();
  return { id: row.id, marker, nationalId: row.nationalId, escalationText };
}

async function kycActions(id: string) {
  return (await auditRowsFor(ENTITY, id)).filter((row) => row.action !== "authz.denied" && row.action !== "approval.denied");
}

async function pendingDecision(id: string) {
  const [row] = await getDb().select().from(kycDecisions).where(and(eq(kycDecisions.caseId, id), eq(kycDecisions.status, "pending")));
  return row ?? null;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("KYC review queue", () => {
  it("INV-1: a compliance officer can't approve a KYC decision they proposed (approvals engine, via the API)", async () => {
    const row = await insertKycCase();
    await claim(row.id, users.compliance);
    await propose(row.id, users.compliance, "reject", "Identity mismatch");

    const deniedResponse = await decide(row.id, users.compliance, "approve");
    expect(deniedResponse.status).toBe(403);
    expect(await responseBody(deniedResponse)).toMatchObject({ error: "approval_denied:self_approval" });
    expect((await kycCaseRow(row.id)).status).toBe("in_review");
    expect(await pendingDecision(row.id)).toMatchObject({ decision: "reject", status: "pending" });
    const denied = (await auditRowsFor(ENTITY, row.id)).filter((auditRow) => auditRow.action === "approval.denied");
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ actorId: users.compliance.id, reason: "self_approval" });

    const approved = await decide(row.id, users.compliance2, "approve");
    expect(approved.status).toBe(200);
    expect(await kycCaseRow(row.id)).toMatchObject({ status: "rejected" });
  });

  it("INV-2: the same compliance officer can't decide the same KYC proposal twice", async () => {
    const row = await insertKycCase();
    await claim(row.id, users.kycReviewer);
    await propose(row.id, users.kycReviewer, "reject", "Identity mismatch");
    expect((await decide(row.id, users.compliance, "approve")).status).toBe(200);
    const second = await decide(row.id, users.compliance, "approve");
    expect(second.status).toBe(409);
    expect(((await responseBody<{ error: string }>(second)).error).startsWith("approval_denied:")).toBe(true);
  });

  it("INV-9: rejecting a case stays pending until compliance approves", async () => {
    const row = await insertKycCase({ riskLevel: "low" });
    await claim(row.id, users.kycReviewer);
    const proposed = await propose(row.id, users.kycReviewer, "reject", "Identity mismatch");
    expect(proposed.status).toBe(200);
    expect((await responseBody<{ status: string }>(proposed)).status).toBe("in_review");
    expect((await responseBody<{ status: string }>(await detail(row.id, users.kycReviewer))).status).toBe("in_review");
    expect((await kycCaseRow(row.id)).status).toBe("in_review");
    expect(await pendingDecision(row.id)).toMatchObject({ decision: "reject" });
    expect((await responseBody<{ status: string }>(await decide(row.id, users.compliance, "approve"))).status).toBe("rejected");
  });

  it("INV-9: approving a high-risk case needs a compliance approval", async () => {
    const row = await insertKycCase({ riskLevel: "high" });
    await claim(row.id, users.kycReviewer);
    const proposed = await propose(row.id, users.kycReviewer, "approve");
    expect((await responseBody<{ status: string }>(proposed)).status).toBe("in_review");
    expect(await pendingDecision(row.id)).toMatchObject({ decision: "approve", status: "pending" });
    expect((await responseBody<{ status: string }>(await decide(row.id, users.compliance, "approve"))).status).toBe("approved");
  });

  it("INV-9: approving a low or medium risk case needs only the reviewer", async () => {
    for (const riskLevel of ["low", "medium"] as const) {
      const row = await insertKycCase({ riskLevel });
      await claim(row.id, users.kycReviewer);
      const res = await propose(row.id, users.kycReviewer, "approve");
      expect(res.status).toBe(200);
      expect(await responseBody(res)).toMatchObject({ status: "approved", pendingDecision: null });
      expect((await kycCaseRow(row.id)).status).toBe("approved");
      expect(await pendingDecision(row.id)).toBeNull();
    }
  });

  it("INV-9: a KYC reviewer can't give the compliance approval (403 via the API)", async () => {
    const row = await insertKycCase();
    await claim(row.id, users.kycReviewer);
    await propose(row.id, users.kycReviewer, "reject", "Identity mismatch");
    const before = await kycCaseRow(row.id);
    const res = await decide(row.id, users.kycReviewer2, "approve");
    expect(res.status).toBe(403);
    expect(await responseBody(res)).toMatchObject({ error: "forbidden" });
    expect(await kycCaseRow(row.id)).toEqual(before);
  });

  it("INV-9: compliance rejecting a proposal sends the case back to the assignee", async () => {
    const row = await insertKycCase();
    await claim(row.id, users.kycReviewer);
    await propose(row.id, users.kycReviewer, "reject", "Identity mismatch");
    expect((await decide(row.id, users.compliance, "reject")).status).toBe(400);
    expect(await pendingDecision(row.id)).toMatchObject({ status: "pending" });
    const rejected = await decide(row.id, users.compliance, "reject", "Evidence supports customer");
    expect(rejected.status).toBe(200);
    expect(await kycCaseRow(row.id)).toMatchObject({ status: "in_review", assignedTo: users.kycReviewer.id });
    expect(await pendingDecision(row.id)).toBeNull();
    const decisions = await getDb().select().from(kycDecisions).where(eq(kycDecisions.caseId, row.id));
    expect(decisions.at(-1)).toMatchObject({ status: "rejected" });
    await propose(row.id, users.kycReviewer, "approve");
    expect(await pendingDecision(row.id)).toMatchObject({ status: "pending" });
  });

  it("INV-9: a case can have only one pending decision", async () => {
    const row = await insertKycCase();
    await claim(row.id, users.kycReviewer);
    expect((await propose(row.id, users.kycReviewer, "reject", "Identity mismatch")).status).toBe(200);
    const second = await propose(row.id, users.kycReviewer, "approve");
    expect(second.status).toBe(409);
    expect(await responseBody(second)).toMatchObject({ error: "case_not_actionable" });
  });

  it("INV-9: escalated cases follow the same four-eyes rules", async () => {
    const row = await insertKycCase({ riskLevel: "high" });
    await claim(row.id, users.kycReviewer);
    await escalate(row.id, users.kycReviewer, "Need enhanced review");
    await propose(row.id, users.compliance, "reject", "High risk mismatch");
    expect(await pendingDecision(row.id)).toMatchObject({ status: "pending", whileEscalated: true });
    const self = await decide(row.id, users.compliance, "approve");
    expect(self.status).toBe(403);
    expect(await responseBody(self)).toMatchObject({ error: "approval_denied:self_approval" });
    expect((await decide(row.id, users.compliance2, "approve")).status).toBe(200);
    expect(await kycCaseRow(row.id)).toMatchObject({ status: "rejected" });
  });

  it("INV-6: every KYC state change writes exactly one audit row", async () => {
    const caseA = await insertKycCase({ riskLevel: "medium" });
    const expectedA = ["kyc.case.claim", "kyc.note.add", "kyc.decision.propose", "kyc.decision.reject", "kyc.case.escalate", "kyc.case.approve"];
    const actionsA: string[] = [];
    const assertNextA = async (action: string) => {
      actionsA.push(action);
      expect((await kycActions(caseA.id)).map((row) => row.action)).toEqual(actionsA);
      expect(actionsA).toEqual(expectedA.slice(0, actionsA.length));
    };
    await claim(caseA.id, users.kycReviewer);
    await assertNextA("kyc.case.claim");
    await addNote(caseA.id, users.kycReviewer, "Reviewed source documents");
    await assertNextA("kyc.note.add");
    await propose(caseA.id, users.kycReviewer, "reject", "Name does not match");
    await assertNextA("kyc.decision.propose");
    await decide(caseA.id, users.compliance, "reject", "Reviewed evidence");
    await assertNextA("kyc.decision.reject");
    await escalate(caseA.id, users.kycReviewer, "Second-level review needed");
    await assertNextA("kyc.case.escalate");
    await propose(caseA.id, users.compliance, "approve", "Risk resolved");
    await assertNextA("kyc.case.approve");

    const caseB = await insertKycCase({ riskLevel: "high" });
    await claim(caseB.id, users.kycReviewer);
    await propose(caseB.id, users.kycReviewer, "approve", "High-risk review");
    await decide(caseB.id, users.compliance, "approve");
    expect((await kycActions(caseB.id)).map((row) => row.action)).toEqual([
      "kyc.case.claim",
      "kyc.decision.propose",
      "kyc.decision.approve",
    ]);
  });

  it("INV-6: if the audit write fails, the KYC change rolls back", async () => {
    const claimCase = await insertKycCase();
    vi.spyOn(audit, "record").mockRejectedValueOnce(new Error("audit down"));
    await expect(claimKycCaseForTest(claimCase.id)).rejects.toThrow("audit down");
    expect(await kycCaseRow(claimCase.id)).toMatchObject({ status: "new", assignedTo: null });

    const escalationCase = await insertKycCase({ status: "in_review", assignedTo: users.kycReviewer.id });
    vi.spyOn(audit, "record").mockRejectedValueOnce(new Error("audit down"));
    await expect(escalateKycCaseForTest(escalationCase.id)).rejects.toThrow("audit down");
    expect(await kycCaseRow(escalationCase.id)).toMatchObject({ status: "in_review" });
    expect(await getDb().select().from(kycNotes).where(eq(kycNotes.caseId, escalationCase.id))).toHaveLength(0);
  });

  it("INV-6: KYC audit rows never contain the national ID or date of birth", async () => {
    const row = await insertKycCase({ riskLevel: "medium" });
    await claim(row.id, users.kycReviewer);
    await addNote(row.id, users.kycReviewer, "Reviewed source documents");
    await propose(row.id, users.kycReviewer, "reject", "Name does not match");
    await decide(row.id, users.compliance, "reject", "Reviewed evidence");
    await escalate(row.id, users.kycReviewer, "Second-level review needed");
    await propose(row.id, users.compliance, "approve", "Risk resolved");
    const rows = await auditRowsFor(ENTITY, row.id);
    const serialized = JSON.stringify(rows);
    expect(rows.map((auditRow) => auditRow.action)).toEqual([
      "kyc.case.claim",
      "kyc.note.add",
      "kyc.decision.propose",
      "kyc.decision.reject",
      "kyc.case.escalate",
      "kyc.case.approve",
    ]);
    expect(serialized).not.toContain(row.nationalId);
    expect(serialized).not.toContain("1984-03-17");
  });

  it("INV-8: GET /api/kyc/cases returns 403 for a requester and an approver", async () => {
    expect((await list(users.requester)).status).toBe(403);
    expect((await list(users.approverA)).status).toBe(403);
  });

  it("INV-8: POST /api/kyc/cases/:id/claim returns 403 for an approver and for an auditor", async () => {
    const row = await insertKycCase();
    expect((await claim(row.id, users.approverA)).status).toBe(403);
    expect((await claim(row.id, users.auditor)).status).toBe(403);
  });

  it("INV-8: an auditor can read KYC cases (200) but not add notes (403)", async () => {
    const row = await insertKycCase();
    expect((await detail(row.id, users.auditor)).status).toBe(200);
    expect((await addNote(row.id, users.auditor, "Auditor note" )).status).toBe(403);
  });

  it("INV-8: the KYC API returns 401 without a session", async () => {
    expect((await list(undefined)).status).toBe(401);
    expect((await list(users.auditor)).status).toBe(200);
  });

  it("INV-10: another reviewer sees an escalated case only as in_review via the API", async () => {
    const { id, marker, nationalId } = await setupEscalatedCase();
    const res = await detail(id, users.kycReviewer2);
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toMatch(/escalated|escalation/i);
    expect(text).not.toContain(marker);
    expect(text).not.toContain(nationalId);
    expect(JSON.parse(text)).toMatchObject({ status: "in_review", nationalId: `•••• ${nationalId.slice(-4)}` });
  });

  it("INV-10: the escalating reviewer also sees it only as in_review", async () => {
    const { id, marker, nationalId, escalationText } = await setupEscalatedCase();
    const res = await detail(id, users.kycReviewer);
    const responseText = await res.text();
    for (const text of [responseText, escalationText]) {
      expect(text).not.toMatch(/escalated|escalation/i);
      expect(text).not.toContain(marker);
      expect(text).not.toContain(nationalId);
    }
    expect(JSON.parse(responseText)).toMatchObject({ status: "in_review", nationalId: `•••• ${nationalId.slice(-4)}` });
  });

  it("INV-10: the case list doesn't reveal escalations to reviewers", async () => {
    const { id } = await setupEscalatedCase();
    const byStatus = await list(users.kycReviewer2, "?f_status=escalated");
    expect((await responseBody<{ total: number }>(byStatus)).total).toBe(0);
    const byId = await list(users.kycReviewer2, `?f_id=${id}`);
    const body = await responseBody<{ rows: { id: string; status: string; nationalId: string }[]; total: number }>(byId);
    expect(body.total).toBe(1);
    expect(body.rows[0]).toMatchObject({ id, status: "in_review" });
    expect(body.rows[0]!.nationalId).toMatch(/^•••• \d{4}$/);
    const firstPageText = await (await list(users.kycReviewer2)).text();
    expect(firstPageText).not.toMatch(/escalated|escalation/i);
    expect(JSON.parse(firstPageText).rows.every((caseRow: { nationalId: string }) => /^•••• \d{4}$/.test(caseRow.nationalId))).toBe(true);
  });

  it("INV-10: reviewer actions on an escalated case get the same 409 as any case they can't work", async () => {
    const { id: escalatedId } = await setupEscalatedCase();
    const control = await insertKycCase({ status: "in_review", assignedTo: users.kycReviewer.id });
    const [escalatedClaim, plainClaim] = await Promise.all([claim(escalatedId, users.kycReviewer2), claim(control.id, users.kycReviewer2)]);
    expect(escalatedClaim.status).toBe(409);
    expect(await escalatedClaim.json()).toEqual(await plainClaim.json());
    const [escalatedNote, plainNote] = await Promise.all([
      addNote(escalatedId, users.kycReviewer2, "Trying to add note"),
      addNote(control.id, users.kycReviewer2, "Trying to add note"),
    ]);
    expect(escalatedNote.status).toBe(409);
    expect(await escalatedNote.json()).toEqual(await plainNote.json());
    const proposed = await propose(escalatedId, users.kycReviewer, "reject", "Review complete");
    const ownNote = await addNote(escalatedId, users.kycReviewer, "Trying own note");
    expect(proposed.status).toBe(409);
    expect(await proposed.json()).toEqual(await ownNote.json());
  });

  it("INV-10: a pending decision on an escalated case is hidden from non-compliance roles", async () => {
    const { id } = await setupEscalatedCase();
    await propose(id, users.compliance, "reject", "High risk mismatch");
    for (const actor of [users.kycReviewer, users.kycReviewer2]) {
      const text = await (await detail(id, actor)).text();
      const body = JSON.parse(text);
      expect(body).toMatchObject({ pendingDecision: null, decisions: [], awaitingCompliance: false });
      expect(text).not.toMatch(/escalated|escalation/i);
    }
    expect((await responseBody<{ pendingDecision: unknown }>(await detail(id, users.compliance))).pendingDecision).not.toBeNull();
  });

  it("INV-10: compliance sees the escalation, its note and the unmasked national ID", async () => {
    const { id, marker, nationalId } = await setupEscalatedCase();
    const body = await responseBody<{ status: string; notes: { kind: string; body: string }[]; nationalId: string }>(await detail(id, users.compliance));
    expect(body.status).toBe("escalated");
    expect(body.notes.some((note) => note.kind === "escalation" && note.body.includes(marker))).toBe(true);
    expect(body.nationalId).toBe(nationalId);
    const filtered = await responseBody<{ rows: { id: string }[] }>(await list(users.compliance, "?f_status=escalated"));
    expect(filtered.rows.some((item) => item.id === id)).toBe(true);
  });

  it("INV-10: an auditor sees escalations but only the last 4 of the national ID", async () => {
    const { id, marker, nationalId } = await setupEscalatedCase();
    const res = await detail(id, users.auditor);
    const text = await res.text();
    expect(text).toMatch(/escalated|escalation/i);
    expect(text).toContain(marker);
    expect(JSON.parse(text)).toMatchObject({ status: "escalated", nationalId: `•••• ${nationalId.slice(-4)}` });
    expect(text).not.toContain(nationalId);
  });

  it("INV-10: notes compliance writes on an escalated case are hidden from reviewers", async () => {
    const { id } = await setupEscalatedCase();
    const marker = `Compliance marker ${randomUUID()}`;
    expect((await addNote(id, users.compliance, marker)).status).toBe(201);
    expect(await (await detail(id, users.kycReviewer)).text()).not.toContain(marker);
  });

  it("INV-10: after compliance decides an escalated case, reviewers see only the final status", async () => {
    const { id } = await setupEscalatedCase();
    await propose(id, users.compliance, "reject", "High risk mismatch");
    await decide(id, users.compliance2, "approve");
    const res = await detail(id, users.kycReviewer2);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ status: "rejected", decisions: [] });
    expect(text).not.toMatch(/escalated|escalation/i);
  });
});

async function claimKycCaseForTest(id: string) {
  return claimKycCase(users.kycReviewer, id);
}

async function escalateKycCaseForTest(id: string) {
  return escalateKycCase(users.kycReviewer, id, "Audit rollback check");
}
