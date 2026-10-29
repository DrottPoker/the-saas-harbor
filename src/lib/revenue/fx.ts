import "server-only";
import { isSecureOrLocalUrl } from "../loopback";
import { VerificationError } from "./errors";

// An override points at the browser tests' fake server: https, or plain http to this machine.
function ratesBase() {
  const base = process.env.FX_API_BASE || "https://api.frankfurter.dev";
  return isSecureOrLocalUrl(base) ? base : null;
}

// Daily reference rates (Frankfurter, central-bank data, no API key). Returns units of each
// currency per 1 USD and the rate date.
export async function usdRates(currencies: string[]) {
  const quotes = [...new Set(currencies.map((c) => c.toLowerCase()))].filter((c) => c !== "usd");
  if (!quotes.length) return { rates: new Map<string, number>(), date: null };
  const base = ratesBase();
  if (!base) throw new VerificationError("run.ratesNotConfigured");
  const url = new URL("/v2/rates", base);
  url.searchParams.set("base", "usd");
  url.searchParams.set("quotes", quotes.join(","));
  let rows: { date: string; quote: string; rate: number }[];
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error();
    rows = await response.json();
  } catch {
    throw new VerificationError("run.ratesUnavailable");
  }
  return ratesFrom(rows);
}

function ratesFrom(rows: { date: string; quote: string; rate: number }[]) {
  const usable = rows.filter(
    (row) =>
      typeof row.quote === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
      Number.isFinite(row.rate) &&
      row.rate > 0,
  );
  const rates = new Map(usable.map((row) => [row.quote.toLowerCase(), row.rate]));
  const dates = new Map(usable.map((row) => [row.quote.toLowerCase(), row.date]));
  const date =
    usable
      .map((row) => row.date)
      .sort()
      .at(-1) ?? null;
  return { rates, dates, date };
}

type Rates = ReturnType<typeof ratesFrom>;
let displayCache: { rates: Promise<Rates | null>; expires: number } | null = null;

/**
 * The rates pages convert displayed amounts with: every quote at once, kept in the process for six
 * hours (the rates change once a day), or ten minutes after a failure, when pages show USD. A page
 * never waits more than four seconds for them.
 */
export function displayRates(currencies: readonly string[]): Promise<Rates | null> {
  const now = Date.now();
  if (displayCache && displayCache.expires > now) return displayCache.rates;
  const rates = (async () => {
    const base = ratesBase();
    if (!base) return null;
    const url = new URL("/v2/rates", base);
    url.searchParams.set("base", "usd");
    url.searchParams.set(
      "quotes",
      currencies
        .filter((c) => c !== "USD")
        .join(",")
        .toLowerCase(),
    );
    try {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(4_000) });
      if (!response.ok) throw new Error(`Exchange rates answered ${response.status}`);
      return ratesFrom(await response.json());
    } catch (error) {
      console.error("Display rates failed:", error instanceof Error ? error.message : error);
      return null;
    }
  })();
  displayCache = { rates, expires: now + 10 * 60_000 };
  void rates.then((value) => {
    if (value && displayCache?.rates === rates) displayCache.expires = Date.now() + 6 * 3_600_000;
  });
  return rates;
}
