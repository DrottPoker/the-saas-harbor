// The statistics page's figures, from public.directory_stats(): shared, fresh, verified MRR of
// listed products only, the same figures the leaderboard shows one by one.
import { z } from "zod";
import type { MrrPoint } from "./charts";

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

// Whole dollars, rounded down, so $9,999.99 reads as $9,999 at the top of its bucket.
const dollars = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.floor(cents / 100));

/** "$0", "Under $1,000", "$1,000 to $9,999", "$100,000 or more". */
export function bucketLabel({
  min_cents,
  max_cents,
}: {
  min_cents: number;
  max_cents: number | null;
}) {
  if (max_cents === 0) return "$0";
  if (max_cents === null) return `${dollars(min_cents)} or more`;
  if (min_cents <= 1) return `Under ${dollars(max_cents + 1)}`;
  return `${dollars(min_cents)} to ${dollars(max_cents)}`;
}

/** "Less than a year ago", "1 to 2 years ago", "5 or more years ago". */
export function ageLabel({
  min_years,
  max_years,
}: {
  min_years: number;
  max_years: number | null;
}) {
  if (max_years === null) return `${min_years} or more years ago`;
  if (min_years === 0)
    return max_years === 1 ? "Less than a year ago" : `Less than ${max_years} years ago`;
  return `${min_years} to ${max_years} years ago`;
}

/** The combined month-end history in the chart's shape. */
export function historyPoints(stats: DirectoryStats): MrrPoint[] {
  return stats.history.map(({ month, mrr_cents }) => ({ month, cents: mrr_cents }));
}

/** A whole-number share of a total, for "12%". */
export function percent(part: number, total: number) {
  return total ? Math.round((part * 100) / total) : 0;
}
