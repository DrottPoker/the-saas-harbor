import "server-only";

// Daily reference rates (Frankfurter, central-bank data, no API key). Returns units of each
// currency per 1 USD and the rate date.
export async function usdRates(currencies: string[]) {
  const quotes = [...new Set(currencies.map((c) => c.toLowerCase()))].filter((c) => c !== "usd");
  if (!quotes.length) return { rates: new Map<string, number>(), date: null };
  const base = process.env.FX_API_BASE || "https://api.frankfurter.dev";
  const url = new URL("/v2/rates", base);
  url.searchParams.set("base", "usd");
  url.searchParams.set("quotes", quotes.join(","));
  let rows: { date: string; quote: string; rate: number }[];
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error();
    rows = await response.json();
  } catch {
    throw new Error("Exchange rates are unavailable right now. Try again shortly.");
  }
  const rates = new Map(rows.map((row) => [row.quote.toLowerCase(), row.rate]));
  const date =
    rows
      .map((row) => row.date)
      .sort()
      .at(-1) ?? null;
  return { rates, date };
}
