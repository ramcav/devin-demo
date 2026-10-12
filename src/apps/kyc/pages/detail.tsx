import Link from "next/link";
import { ForbiddenError, NotFoundError } from "@/platform/errors";
import { requirePageUser } from "@/platform/session";
import { Forbidden } from "@/platform/ui/forbidden";
import { getKycCase } from "../service";
import { AddNoteForm, ClaimForm, DecideProposalForm, EscalateForm, ProposeForm } from "../ui/forms";
import { StatusBadge } from "../ui/status-badge";

export default async function KycDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  let kyc;
  try {
    kyc = await getKycCase(user, id);
  } catch (err) {
    if (err instanceof ForbiddenError) return <main className="p-8"><Forbidden /></main>;
    if (err instanceof NotFoundError) return <main className="p-8">Case not found.</main>;
    throw err;
  }
  return (
    <main className="space-y-6 p-8">
      <div>
        <Link href="/kyc" className="text-sm text-gray-600 underline">
          ← KYC queue
        </Link>
        <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">
          KYC case <span className="font-mono text-lg">{kyc.id}</span> <StatusBadge status={kyc.status} testId="kyc-status" />
        </h1>
      </div>
      <dl className="grid max-w-2xl grid-cols-[10rem_1fr] gap-y-1 rounded border bg-white p-4 text-sm">
        <dt className="text-gray-500">Customer</dt>
        <dd>{kyc.customerName}</dd>
        <dt className="text-gray-500">Date of birth</dt>
        <dd>{kyc.dateOfBirth}</dd>
        <dt className="text-gray-500">Country</dt>
        <dd>{kyc.country}</dd>
        <dt className="text-gray-500">Risk level</dt>
        <dd>{kyc.riskLevel}</dd>
        <dt className="text-gray-500">Status</dt>
        <dd>{kyc.status.replace("_", " ")}</dd>
        <dt className="text-gray-500">Assigned to</dt>
        <dd data-testid="kyc-assignee">{kyc.assignedTo?.name ?? "Unassigned"}</dd>
        <dt className="text-gray-500">National ID</dt>
        <dd data-testid="kyc-national-id" className="font-mono">
          {kyc.nationalId}
        </dd>
        <dt className="text-gray-500">Created</dt>
        <dd>{kyc.createdAt.replace("T", " ").slice(0, 16)}</dd>
      </dl>

      {kyc.actions.claim && <ClaimForm id={kyc.id} />}

      {kyc.pendingDecision && (
        <section className="max-w-2xl" data-testid="kyc-pending-decision">
          <h2 className="mb-2 font-medium">Pending decision</h2>
          <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm">
            <p>
              <span className={kyc.pendingDecision.decision === "approve" ? "text-green-700" : "text-red-700"}>
                {kyc.pendingDecision.decision === "approve" ? "Approve" : "Reject"}
              </span>{" "}
              proposed by {kyc.pendingDecision.proposedBy.name}
            </p>
            <p className="mt-1 text-gray-700">“{kyc.pendingDecision.reason}”</p>
          </div>
          {kyc.actions.decideProposal && (
            <div className="mt-3">
              <h3 className="mb-2 text-sm font-medium">Compliance decision</h3>
              <DecideProposalForm id={kyc.id} isProposer={kyc.actions.isProposer} />
            </div>
          )}
        </section>
      )}

      {kyc.actions.propose && (
        <section className="max-w-2xl">
          <h2 className="mb-2 font-medium">Propose a decision</h2>
          <ProposeForm id={kyc.id} />
        </section>
      )}

      {kyc.actions.escalate && (
        <section className="max-w-2xl">
          <h2 className="mb-2 font-medium">Escalate</h2>
          <EscalateForm id={kyc.id} />
        </section>
      )}

      {kyc.actions.addNote && (
        <section className="max-w-2xl">
          <h2 className="mb-2 font-medium">Add a note</h2>
          <AddNoteForm id={kyc.id} />
        </section>
      )}

      <section className="max-w-2xl">
        <h2 className="mb-2 font-medium">Notes</h2>
        {kyc.notes.length === 0 ? (
          <p className="text-sm text-gray-500">No notes yet.</p>
        ) : (
          <ul className="divide-y rounded border bg-white text-sm" data-testid="kyc-notes">
            {kyc.notes.map((n) => (
              <li key={n.id} className="px-4 py-2">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {n.kind === "escalation" && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-800">Escalation</span>
                  )}
                  <span>
                    {n.author.name} · {n.createdAt.replace("T", " ").slice(0, 16)}
                  </span>
                </div>
                <p className="mt-1">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="max-w-2xl">
        <h2 className="mb-2 font-medium">Decisions</h2>
        {kyc.decisions.length === 0 ? (
          <p className="text-sm text-gray-500">No decisions yet.</p>
        ) : (
          <ul className="divide-y rounded border bg-white text-sm" data-testid="kyc-decisions">
            {kyc.decisions.map((d) => (
              <li key={d.id} className="px-4 py-2">
                <p>
                  <span className={d.decision === "approve" ? "text-green-700" : "text-red-700"}>
                    {d.decision === "approve" ? "Approve" : "Reject"}
                  </span>{" "}
                  proposed by {d.proposedBy.name} · {d.status}
                  {d.decidedAt && <span className="text-gray-500"> · decided {d.decidedAt.replace("T", " ").slice(0, 16)}</span>}
                </p>
                <p className="mt-0.5 text-gray-600">“{d.reason}”</p>
                {d.approvals.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
                    {d.approvals.map((a) => (
                      <li key={`${a.approverId}-${a.at}`}>
                        {a.decision === "approve" ? "Approved" : "Rejected"} by {a.approverName} · {a.at.replace("T", " ").slice(0, 16)}
                        {a.reason && <span> · “{a.reason}”</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
