import { refundStatuses } from "../schema";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Defaults to the previous calendar month (UTC), the usual month-end close window. */
function previousMonth(now = new Date()): { from: string; to: string } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return { from: isoDay(from), to: isoDay(to) };
}

export function ExportForm({ status }: { status?: string }) {
  const { from, to } = previousMonth();
  return (
    <form method="GET" action="/api/refunds/export" className="mb-4 flex flex-wrap items-end gap-2 rounded border bg-gray-50 p-3" data-testid="refund-export">
      <label className="flex flex-col text-xs text-gray-600">
        Created from (UTC)
        <input type="date" name="from" defaultValue={from} required className="rounded border bg-white px-2 py-1 text-sm" />
      </label>
      <label className="flex flex-col text-xs text-gray-600">
        Created to (UTC)
        <input type="date" name="to" defaultValue={to} required className="rounded border bg-white px-2 py-1 text-sm" />
      </label>
      <label className="flex flex-col text-xs text-gray-600">
        Export status
        <select name="status" defaultValue={status ?? ""} className="rounded border bg-white px-2 py-1 text-sm">
          <option value="">Any</option>
          {refundStatuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white">
        Download CSV
      </button>
    </form>
  );
}
