import Link from "next/link";
import { ForbiddenError } from "@/platform/errors";
import { formatMoney } from "@/platform/format";
import { parseGridParams, type SearchParams } from "@/platform/grid";
import { requirePageUser } from "@/platform/session";
import { DataGrid } from "@/platform/ui/data-grid";
import { Forbidden } from "@/platform/ui/forbidden";
import { chargeGridSpec, listChargesForRefund } from "../service";
import { CreateRefundForm } from "../ui/forms";

export default async function NewRefundPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const params = parseGridParams(sp, chargeGridSpec);
  const selectedId = typeof sp.charge === "string" ? sp.charge : null;
  let data, selected;
  try {
    data = await listChargesForRefund(user, params);
    selected = selectedId ? (await listChargesForRefund(user, parseGridParams({ f_id: selectedId }, chargeGridSpec))).rows[0] : undefined;
  } catch (err) {
    if (err instanceof ForbiddenError) return <main className="p-8"><Forbidden /></main>;
    throw err;
  }
  return (
    <main className="space-y-6 p-8">
      <h1 className="text-2xl font-semibold">New refund</h1>
      {selected ? (
        <section className="space-y-2">
          <h2 className="font-medium">
            Charge <span className="font-mono text-sm">{selected.id}</span> · {selected.customerName} · {formatMoney(selected.amountCents, selected.currency)}
          </h2>
          <CreateRefundForm chargeId={selected.id} card={selected.card} maxLabel={formatMoney(selected.remainingCents, selected.currency)} />
          <Link href="/refunds/new" className="text-sm underline">
            Pick a different charge
          </Link>
        </section>
      ) : (
        <section className="space-y-2">
          <h2 className="font-medium">1. Pick a charge</h2>
          <DataGrid
            basePath="/refunds/new"
            params={params}
            total={data.total}
            filters={[{ key: "customerName", label: "Customer contains" }, { key: "id", label: "Charge id" }]}
            columns={[
              { key: "id", label: "Charge" },
              { key: "customerName", label: "Customer", sortable: true },
              { key: "card", label: "Card" },
              { key: "amountCents", label: "Amount", sortable: true },
              { key: "remainingCents", label: "Refundable", sortable: true },
              { key: "createdAt", label: "Date", sortable: true },
              { key: "select", label: "" },
            ]}
            rows={data.rows.map((c) => ({
              id: c.id,
              cells: {
                id: <span className="font-mono text-xs">{c.id}</span>,
                customerName: c.customerName,
                card: c.card,
                amountCents: formatMoney(c.amountCents, c.currency),
                remainingCents: formatMoney(c.remainingCents, c.currency),
                createdAt: c.createdAt.slice(0, 10),
                select:
                  c.remainingCents > 0 ? (
                    <Link href={`/refunds/new?charge=${c.id}`} className="rounded border px-2 py-0.5 text-xs hover:bg-gray-100" aria-label={`Select ${c.id}`}>
                      Select
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-400">Fully refunded</span>
                  ),
              },
            }))}
          />
        </section>
      )}
    </main>
  );
}
