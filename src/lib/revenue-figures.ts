// The revenue figures besides MRR, and the rankings of the leaderboard. Safe for the browser.
import type { Listing } from "./data";

export type RevenueColumn = "revenue_30d_cents" | "revenue_12m_cents" | "revenue_total_cents";

/** What the leaderboard ranks by: verified MRR, or revenue over a window. */
export type Ranking = "mrr" | "30d" | "12m" | "all";

export const REVENUE_WINDOWS: {
  ranking: Exclude<Ranking, "mrr">;
  column: RevenueColumn;
  /** The figure's name on its own, as on a product page. */
  label: string;
  /** The window in a few words, as in the ranking choice. */
  short: string;
}[] = [
  { ranking: "30d", column: "revenue_30d_cents", label: "Revenue, last 30 days", short: "30 days" },
  {
    ranking: "12m",
    column: "revenue_12m_cents",
    label: "Revenue, last 12 months",
    short: "12 months",
  },
  { ranking: "all", column: "revenue_total_cents", label: "Revenue, all time", short: "All time" },
];

/** The ranking a `by` parameter names; MRR when it names none. */
export function rankingFrom(value: string | undefined): Ranking {
  return REVENUE_WINDOWS.find((window) => window.ranking === value)?.ranking ?? "mrr";
}

/** The revenue window of a ranking, or undefined for MRR. */
export function revenueWindow(ranking: Ranking) {
  return REVENUE_WINDOWS.find((window) => window.ranking === ranking);
}

/** Whether a listing shows any revenue figure besides MRR. */
export function sharesRevenue(item: Listing) {
  return REVENUE_WINDOWS.some(({ column }) => item[column] != null);
}
