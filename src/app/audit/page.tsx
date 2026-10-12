import { auditGridSpec, listAuditLog } from "@/platform/audit-service";
import { roles } from "@/platform/db/schema";
import { ForbiddenError } from "@/platform/errors";
import { parseGridParams, type SearchParams } from "@/platform/grid";
import { requirePageUser } from "@/platform/session";
import { DataGrid } from "@/platform/ui/data-grid";
import { Forbidden } from "@/platform/ui/forbidden";

export const dynamic = "force-dynamic";

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-gray-400">—</span>;
  return <pre className="max-w-xs whitespace-pre-wrap break-all text-xs text-gray-700">{JSON.stringify(value, null, 1)}</pre>;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageUser();
  const params = parseGridParams(await searchParams, auditGridSpec);
  let data;
  try {
    data = await listAuditLog(user, params);
  } catch (err) {
    if (err instanceof ForbiddenError) return <main className="p-8"><Forbidden /></main>;
    throw err;
  }
  return (
    <main className="p-8">
      <h1 className="mb-1 text-2xl font-semibold">Audit log</h1>
      <p className="mb-4 text-sm text-gray-600">Append-only. Rows cannot be edited or deleted, by anyone.</p>
      <DataGrid
        basePath="/audit"
        params={params}
        total={data.total}
        filters={[
          { key: "action", label: "Action contains" },
          { key: "entityType", label: "Entity type" },
          { key: "entityId", label: "Entity id" },
          { key: "actorId", label: "Actor id" },
          { key: "actorRole", label: "Actor role", options: roles.map((r) => ({ value: r, label: r })) },
        ]}
        columns={[
          { key: "at", label: "At", sortable: true },
          { key: "actorId", label: "Actor", sortable: true },
          { key: "action", label: "Action", sortable: true },
          { key: "entityType", label: "Entity", sortable: true },
          { key: "reason", label: "Reason" },
          { key: "before", label: "Before" },
          { key: "after", label: "After" },
          { key: "requestId", label: "Request" },
        ]}
        rows={data.rows.map((r) => ({
          id: String(r.id),
          cells: {
            at: <time dateTime={r.at.toISOString()}>{r.at.toISOString().replace("T", " ").slice(0, 19)}</time>,
            actorId: (
              <span>
                {r.actorId} <span className="text-xs text-gray-500">({r.actorRole})</span>
              </span>
            ),
            action: <code className="text-xs">{r.action}</code>,
            entityType: (
              <span className="text-xs">
                {r.entityType}:{r.entityId}
              </span>
            ),
            reason: r.reason ?? "",
            before: <Json value={r.before} />,
            after: <Json value={r.after} />,
            requestId: <span className="text-xs text-gray-400">{r.requestId?.slice(0, 8) ?? ""}</span>,
          },
        }))}
      />
    </main>
  );
}
