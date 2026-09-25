// MRR history from paid charges, the way revenue analytics tools reconstruct it: each paid
// recurring charge contributes its monthly rate to every instant inside its service period. Each
// provider turns its own invoices, transactions or orders into service lines. Pure functions.

/** A paid recurring charge as a monthly rate over its service period (Unix seconds). */
export type ServiceLine = { start: number; end: number; currency: string; monthly: number };

/** MRR per currency, in minor units, at one instant (period start inclusive, end exclusive). */
export function mrrAt(lines: ServiceLine[], at: number) {
  const byCurrency: Record<string, number> = {};
  for (const line of lines) {
    if (line.start <= at && at < line.end)
      byCurrency[line.currency] = (byCurrency[line.currency] ?? 0) + line.monthly;
  }
  for (const [currency, value] of Object.entries(byCurrency))
    if (value <= 0) delete byCurrency[currency];
  return byCurrency;
}

/** The last instant of each of the `count` most recent completed calendar months, oldest first. */
export function monthEnds(now: Date, count = 12) {
  const points: { month: string; at: number }[] = [];
  for (let back = count; back >= 1; back--) {
    const nextMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back + 1, 1);
    const end = new Date(nextMonthStart - 1000);
    const month = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}`;
    points.push({ month, at: Math.floor(end.getTime() / 1000) });
  }
  return points;
}

/** Charges made this far back cover every month-end in the history, annual plans included. */
export function historyWindowStart(now: Date) {
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 25, 1) / 1000);
}

/** Unix seconds from an ISO timestamp, or null when it is missing or unreadable. */
export function unixSeconds(value: string | null | undefined) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}
