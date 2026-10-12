// Leading characters that make spreadsheets treat a cell as a formula (CSV/formula injection).
const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell: neutralises formula-like text and quotes per RFC 4180. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV document with a header row, CRLF line endings and a UTF-8 BOM so Excel reads non-ASCII text correctly. */
export function toCsv(header: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
