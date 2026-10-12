import Link from "next/link";
import { ForbiddenError } from "@/platform/errors";
import { parseGridParams, type SearchParams } from "@/platform/grid";
import { can } from "@/platform/policy";
import { requirePageUser } from "@/platform/session";
import { DataGrid } from "@/platform/ui/data-grid";
import { Forbidden } from "@/platform/ui/forbidden";
import { kycCaseStatuses, kycRiskLevels } from "../schema";
import { kycGridSpec, listKycCases } from "../service";
import { StatusBadge } from "../ui/status-badge";

export default async function KycListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageUser();
  const params = parseGridParams(await searchParams, kycGridSpec);
  const canViewEscalations = can(user, "kyc.escalation.view");
  let data;
  try {
    data = await listKycCases(user, params);
  } catch (err) {
    if (err instanceof ForbiddenError) return <main className="p-8"><Forbidden /></main>;
    throw err;
  }
  const statusOptions = canViewEscalations ? kycCaseStatuses : kycCaseStatuses.filter((s) => s !== "escalated");
  return (
    <main className="p-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">KYC review queue</h1>
        {params.filters.assignedTo === user.id ? (
          <Link href="/kyc" className="rounded border px-3 py-1.5 text-sm text-gray-700">
            Showing my cases — clear
          </Link>
        ) : (
          <Link href={`/kyc?f_assignedTo=${user.id}`} className="rounded border px-3 py-1.5 text-sm text-gray-700">
            Assigned to me
          </Link>
        )}
      </div>
      <DataGrid
        basePath="/kyc"
        params={params}
        total={data.total}
        filters={[
          { key: "status", label: "Status", options: statusOptions.map((s) => ({ value: s, label: s.replace("_", " ") })) },
          { key: "riskLevel", label: "Risk", options: kycRiskLevels.map((r) => ({ value: r, label: r })) },
          { key: "customerName", label: "Customer contains" },
        ]}
        columns={[
          { key: "id", label: "Case" },
          { key: "customerName", label: "Customer", sortable: true },
          { key: "country", label: "Country", sortable: true },
          { key: "riskLevel", label: "Risk", sortable: true },
          { key: "status", label: "Status", sortable: true },
          { key: "assignedTo", label: "Assigned to" },
          { key: "nationalId", label: "National ID" },
          { key: "createdAt", label: "Created", sortable: true },
        ]}
        rows={data.rows.map((r) => ({
          id: r.id,
          cells: {
            id: (
              <Link href={`/kyc/${r.id}`} className="font-mono text-xs underline">
                {r.id}
              </Link>
            ),
            customerName: r.customerName,
            country: r.country,
            riskLevel: r.riskLevel,
            status: (
              <span className="inline-flex items-center gap-1">
                <StatusBadge status={r.status} />
                {r.awaitingCompliance && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">Awaiting compliance</span>
                )}
              </span>
            ),
            assignedTo: r.assignedTo?.name ?? "—",
            nationalId: <span className="font-mono text-xs">{r.nationalId}</span>,
            createdAt: r.createdAt.replace("T", " ").slice(0, 16),
          },
        }))}
        emptyText="No KYC cases yet"
      />
    </main>
  );
}
