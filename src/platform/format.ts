export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

/** Cards are only ever shown masked. */
export function maskCard(last4: string): string {
  return `•••• ${last4}`;
}

/** "750", "750.5", "1,200.00" → integer cents, or null if not a valid positive amount with at most 2 decimals. */
export function parseMoneyToCents(input: string): number | null {
  const s = input.trim().replace(/[$,\s]/g, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
