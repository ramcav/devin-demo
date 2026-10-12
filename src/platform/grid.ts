import { and, asc, desc, eq, ilike, type AnyColumn, type SQL } from "drizzle-orm";

export type FilterMode = "eq" | "contains";

export type GridSpec = {
  sortable: readonly string[];
  filterable: Readonly<Record<string, FilterMode>>;
  defaultSort: string;
  defaultDir: "asc" | "desc";
  pageSize?: number;
};

export type GridParams = {
  page: number;
  pageSize: number;
  sort: string;
  dir: "asc" | "desc";
  filters: Record<string, string>;
  modes: Readonly<Record<string, FilterMode>>;
};

export type SearchParams = Record<string, string | string[] | undefined>;

export const MAX_PAGE_SIZE = 100;
const FILTER_PREFIX = "f_";

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Parses URL search params into grid params, accepting only whitelisted sort and filter columns. */
export function parseGridParams(sp: SearchParams, spec: GridSpec): GridParams {
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? "1", 10) || 1);
  const requestedSize = Number.parseInt(first(sp.pageSize) ?? "", 10);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedSize || spec.pageSize || 20));
  const sortParam = first(sp.sort);
  const sort = sortParam && spec.sortable.includes(sortParam) ? sortParam : spec.defaultSort;
  const dirParam = first(sp.dir);
  const dir = dirParam === "asc" || dirParam === "desc" ? dirParam : spec.defaultDir;
  const filters: Record<string, string> = {};
  for (const key of Object.keys(spec.filterable)) {
    const value = first(sp[FILTER_PREFIX + key])?.trim();
    if (value) filters[key] = value;
  }
  return { page, pageSize, sort, dir, filters, modes: spec.filterable };
}

export function filterParamName(key: string): string {
  return FILTER_PREFIX + key;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Builds WHERE / ORDER BY / LIMIT / OFFSET for a server-side paged query. */
export function gridQuery(params: GridParams, columns: Readonly<Record<string, AnyColumn>>, base?: SQL) {
  const conditions: SQL[] = base ? [base] : [];
  for (const [key, value] of Object.entries(params.filters)) {
    const column = columns[key];
    if (!column) continue;
    conditions.push(params.modes[key] === "contains" ? ilike(column, `%${escapeLike(value)}%`) : eq(column, value));
  }
  const sortColumn = columns[params.sort];
  if (!sortColumn) throw new Error(`Grid sort column not mapped: ${params.sort}`);
  return {
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: params.dir === "asc" ? asc(sortColumn) : desc(sortColumn),
    limit: params.pageSize,
    offset: (params.page - 1) * params.pageSize,
  };
}
