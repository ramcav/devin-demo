import Link from "next/link";
import type { ReactNode } from "react";
import { filterParamName, type GridParams } from "../grid";

export type GridColumn = { key: string; label: string; sortable?: boolean };
export type GridFilter = { key: string; label: string; options?: { value: string; label: string }[] };
export type GridRow = { id: string; cells: Record<string, ReactNode> };

type Props = {
  basePath: string;
  params: GridParams;
  total: number;
  columns: GridColumn[];
  rows: GridRow[];
  filters?: GridFilter[];
  emptyText?: string;
};

function hrefWith(basePath: string, params: GridParams, overrides: Record<string, string | number>): string {
  const q = new URLSearchParams();
  q.set("page", String(params.page));
  q.set("sort", params.sort);
  q.set("dir", params.dir);
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  for (const [k, v] of Object.entries(params.filters)) q.set(filterParamName(k), v);
  for (const [k, v] of Object.entries(overrides)) q.set(k, String(v));
  return `${basePath}?${q.toString()}`;
}

/** Server-rendered table: pagination, sorting and filtering all happen in SQL via URL params. */
export function DataGrid({ basePath, params, total, columns, rows, filters = [], emptyText = "No rows" }: Props) {
  const pages = Math.max(1, Math.ceil(total / params.pageSize));
  return (
    <div className="space-y-3">
      {filters.length > 0 && (
        <form method="GET" action={basePath} className="flex flex-wrap items-end gap-2" data-testid="grid-filters">
          <input type="hidden" name="sort" value={params.sort} />
          <input type="hidden" name="dir" value={params.dir} />
          {filters.map((f) => (
            <label key={f.key} className="flex flex-col text-xs text-gray-600">
              {f.label}
              {f.options ? (
                <select name={filterParamName(f.key)} defaultValue={params.filters[f.key] ?? ""} className="rounded border bg-white px-2 py-1 text-sm">
                  <option value="">Any</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input name={filterParamName(f.key)} defaultValue={params.filters[f.key] ?? ""} className="rounded border bg-white px-2 py-1 text-sm" />
              )}
            </label>
          ))}
          <button type="submit" className="rounded bg-gray-800 px-3 py-1 text-sm text-white">
            Filter
          </button>
          <Link href={basePath} className="px-2 py-1 text-sm text-gray-600 underline">
            Clear
          </Link>
        </form>
      )}
      <div className="overflow-x-auto rounded border bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-100 text-xs uppercase text-gray-600">
            <tr>
              {columns.map((c) => {
                const active = params.sort === c.key;
                const nextDir = active && params.dir === "asc" ? "desc" : "asc";
                return (
                  <th key={c.key} className="px-3 py-2 font-medium">
                    {c.sortable ? (
                      <Link href={hrefWith(basePath, params, { sort: c.key, dir: nextDir, page: 1 })} className="hover:underline">
                        {c.label}
                        {active ? (params.dir === "asc" ? " ▲" : " ▼") : ""}
                      </Link>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-gray-500">
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 align-top">
                  {columns.map((c) => (
                    <td key={c.key} className="px-3 py-2">
                      {r.cells[c.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          {total} row{total === 1 ? "" : "s"} · page {params.page} of {pages}
        </span>
        <span className="space-x-3">
          {params.page > 1 && <Link href={hrefWith(basePath, params, { page: params.page - 1 })} className="underline">Previous</Link>}
          {params.page < pages && <Link href={hrefWith(basePath, params, { page: params.page + 1 })} className="underline">Next</Link>}
        </span>
      </div>
    </div>
  );
}
