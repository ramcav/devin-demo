import Link from "next/link";
import { ForbiddenError } from "@/platform/errors";
import { formatMoney } from "@/platform/format";
import { parseGridParams, type SearchParams } from "@/platform/grid";
import { can } from "@/platform/policy";
import { requirePageUser } from "@/platform/session";
import { DataGrid } from "@/platform/ui/data-grid";
import { Forbidden } from "@/platform/ui/forbidden";
import { listRefunds, refundGridSpec, refundStatuses } from "../service";
import { StatusBadge } from "../ui/status-badge";

export default async function RefundsListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageUser();
  const params = parseGridParams(await searchParams, refundGridSpec);
  let data;
  try {
    data = await listRefunds(user, params);
  } catch (err) {
    if (err instanceof ForbiddenError) return <main className="p-8"><Forbidden /></main>;
    throw err;
  }
  return (
    <main className="p-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Refunds</h1>
        {can(user, "refund.create") && (
          <Link href="/refunds/new" className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white">
            New refund
          </Link>
        )}
      </div>
      <DataGrid
        basePath="/refunds"
        params={params}
        total={data.total}
        filters={[
          { key: "status", label: "Status", options: refundStatuses.map((s) => ({ value: s, label: s })) },
          { key: "customerName", label: "Customer contains" },
          { key: "chargeId", label: "Charge id" },
        ]}
        columns={[
          { key: "id", label: "Refund" },
          { key: "customerName", label: "Customer", sortable: true },
          { key: "amountCents", label: "Amount", sortable: true },
          { key: "status", label: "Status", sortable: true },
          { key: "approvals", label: "Approvals" },
          { key: "createdBy", label: "Requested by" },
          { key: "createdAt", label: "Created", sortable: true },
        ]}
        rows={data.rows.map((r) => ({
          id: r.id,
          cells: {
            id: (
              <Link href={`/refunds/${r.id}`} className="font-mono text-xs underline">
                {r.id}
              </Link>
            ),
            customerName: (
              <span>
                {r.customerName} <span className="text-xs text-gray-500">{r.card}</span>
              </span>
            ),
            amountCents: formatMoney(r.amountCents, r.currency),
            status: <StatusBadge status={r.status} />,
            approvals: `${r.approvals}/${r.requiredApprovals}`,
            createdBy: r.createdBy.name,
            createdAt: r.createdAt.replace("T", " ").slice(0, 16),
          },
        }))}
        emptyText="No refund requests yet"
      />
    </main>
  );
}
