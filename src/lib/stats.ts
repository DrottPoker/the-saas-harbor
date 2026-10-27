// The statistics page's figures, from public.directory_stats(): shared, fresh, verified MRR of
// listed products only, the same figures the leaderboard shows one by one.
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { LOCALE_INFO } from "@/i18n/config";
import type { MrrPoint } from "./charts";
import { formatUsdIn } from "./display-money";

/** Below this many ranked products the page shows no statistics, as they would say little. */
export const STATS_MINIMUM = 5;

const count = z.coerce.number().int().nonnegative();
const cents = z.coerce.number().nonnegative();

const statsSchema = z.object({
  ranked: count,
  mrr_cents: cents,
  median_mrr_cents: cents.nullable(),
  customers: cents.nullable(),
  customer_products: count,
  buckets: z.array(z.object({ min_cents: cents, max_cents: cents.nullable(), products: count })),
  categories: z.array(
    z.object({
      category: z.string(),
      products: count,
      mrr_cents: cents,
      median_mrr_cents: cents,
    }),
  ),
  growth: z.object({
    products: count,
    median_pct: z.coerce.number().nullable(),
    growing: count,
    shrinking: count,
    flat: count,
  }),
  ages: z.array(
    z.object({
      min_years: count,
      max_years: count.nullable(),
      products: count,
      median_mrr_cents: cents.nullable(),
    }),
  ),
  history: z.array(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), mrr_cents: cents })),
  fastest: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      mrr_cents: cents,
      mrr_growth_pct: z.coerce.number(),
    }),
  ),
});

export type DirectoryStats = z.infer<typeof statsSchema>;

/** Reads the function's result; anything malformed is an error, never a wrong figure. */
export function parseStats(value: unknown): DirectoryStats {
  return statsSchema.parse(value);
}

/**
 * The names of the MRR buckets and of the bands of time since launch, in the page's language. The
 * buckets stay in US dollars, which the database counts them by, written the way the language
 * writes money: "$0", "Under $1,000", "$1,000 to $9,999", "$100,000 or more". The bands read "Less
 * than a year ago", "1 to 2 years ago", "5 or more years ago".
 */
export async function statsLabels() {
  const [t, locale] = await Promise.all([getTranslations("stats"), getLocale()]);
  // Whole dollars, rounded down, so $9,999.99 reads as $9,999 at the top of its bucket.
  const dollars = (cents: number) =>
    formatUsdIn(Math.floor(cents / 100) * 100, LOCALE_INFO[locale].intl);
  return {
    bucket({ min_cents, max_cents }: { min_cents: number; max_cents: number | null }) {
      if (max_cents === 0) return dollars(0);
      if (max_cents === null) return t("buckets.atLeast", { amount: dollars(min_cents) });
      if (min_cents <= 1) return t("buckets.under", { amount: dollars(max_cents + 1) });
      return t("buckets.between", { min: dollars(min_cents), max: dollars(max_cents) });
    },
    age({ min_years, max_years }: { min_years: number; max_years: number | null }) {
      if (max_years === null) return t("launchBands.atLeast", { min: min_years });
      if (min_years === 0)
        return max_years === 1
          ? t("launchBands.underOne")
          : t("launchBands.under", { max: max_years });
      return t("launchBands.between", { min: min_years, max: max_years });
    },
  };
}

/** The combined month-end history in the chart's shape. */
export function historyPoints(stats: DirectoryStats): MrrPoint[] {
  return stats.history.map(({ month, mrr_cents }) => ({ month, cents: mrr_cents }));
}

/** A whole-number share of a total, for "12%". */
export function percent(part: number, total: number) {
  return total ? Math.round((part * 100) / total) : 0;
}
