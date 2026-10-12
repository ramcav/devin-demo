import Link from "next/link";
import { ForbiddenError, NotFoundError } from "@/platform/errors";
import { formatMoney } from "@/platform/format";
import { can } from "@/platform/policy";
import { requirePageUser } from "@/platform/session";
import { Forbidden } from "@/platform/ui/forbidden";
import { getRefund } from "../service";
import { DecisionForm, RetryPaymentForm } from "../ui/forms";
import { StatusBadge } from "../ui/status-badge";

export default async function RefundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  let r;
  try {
    r = await getRefund(user, id);
  } catch (err) {
    if (err instanceof ForbiddenError) return <main className="p-8"><Forbidden /></main>;
    if (err instanceof NotFoundError) return <main className="p-8">Refund not found.</main>;
    throw err;
  }
  return (
    <main className="space-y-6 p-8">
      <div>
        <Link href="/refunds" className="text-sm text-gray-600 underline">
          ← Refunds
        </Link>
        <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">
          Refund <span className="font-mono text-lg">{r.id}</span> <StatusBadge status={r.status} />
        </h1>
      </div>
      <dl className="grid max-w-2xl grid-cols-[10rem_1fr] gap-y-1 rounded border bg-white p-4 text-sm">
        <dt className="text-gray-500">Amount</dt>
        <dd data-testid="refund-amount">{formatMoney(r.amountCents, r.currency)}</dd>
        <dt className="text-gray-500">Charge</dt>
        <dd>
          <span className="font-mono">{r.chargeId}</span> · {r.customerName} · {formatMoney(r.chargeAmountCents, r.currency)}
        </dd>
        <dt className="text-gray-500">Refund to</dt>
        <dd>Original payment method {r.card}</dd>
        <dt className="text-gray-500">Reason</dt>
        <dd>{r.reason}</dd>
        <dt className="text-gray-500">Requested by</dt>
        <dd>
          {r.createdBy.name} · {r.createdAt.replace("T", " ").slice(0, 16)}
        </dd>
        <dt className="text-gray-500">Approvals</dt>
        <dd data-testid="refund-approvals">
          {r.approvals} of {r.requiredApprovals} required
        </dd>
        {r.providerRefundId && (
          <>
            <dt className="text-gray-500">Provider refund</dt>
            <dd className="font-mono">{r.providerRefundId}</dd>
          </>
        )}
        {r.failureReason && (
          <>
            <dt className="text-gray-500">Payment failure</dt>
            <dd className="text-red-700">{r.failureReason}</dd>
          </>
        )}
      </dl>
      <section className="max-w-2xl">
        <h2 className="mb-2 font-medium">Decisions</h2>
        {r.decisions.length === 0 ? (
          <p className="text-sm text-gray-500">No decisions yet.</p>
        ) : (
          <ul className="divide-y rounded border bg-white text-sm" data-testid="decisions">
            {r.decisions.map((d) => (
              <li key={d.approverId} className="px-4 py-2">
                <span className={d.decision === "approve" ? "text-green-700" : "text-red-700"}>{d.decision === "approve" ? "Approved" : "Rejected"}</span> by{" "}
                {d.approverName} · {d.at.replace("T", " ").slice(0, 16)}
                {d.reason && <span className="text-gray-600"> · “{d.reason}”</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
      {r.status === "pending" && can(user, "refund.approve") && (
        <section>
          <h2 className="mb-2 font-medium">Your decision</h2>
          <DecisionForm id={r.id} isCreator={r.createdBy.id === user.id} />
        </section>
      )}
      {r.status === "payment_failed" && can(user, "refund.retry_payment") && <RetryPaymentForm id={r.id} />}
    </main>
  );
}
