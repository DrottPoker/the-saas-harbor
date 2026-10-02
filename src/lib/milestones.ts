// Milestones a product reaches: an MRR threshold or a place on the leaderboard. The database
// records them (migration 20260927140000_milestones.sql, which lists the same keys); this module
// names them and builds the links to share them.
import { compactUsd } from "./charts";
import { formatUsd } from "./domain";
import { SITE_NAME } from "./seo";

/** MRR thresholds in whole USD. */
export const MRR_MILESTONES = [
  100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000,
] as const;
/** Leaderboard places, from the lowest. */
export const RANK_MILESTONES = [10, 3, 1] as const;

export type Milestone = { kind: "mrr"; usd: number } | { kind: "rank"; place: number };

/** The key in addresses and the database, such as `mrr-10000` or `top-3`. */
export function milestoneKey(milestone: Milestone) {
  return milestone.kind === "mrr" ? `mrr-${milestone.usd}` : `top-${milestone.place}`;
}

export function parseMilestone(key: string): Milestone | null {
  // One spelling per milestone: no leading zeros.
  const match = /^(mrr|top)-([1-9]\d{0,6})$/.exec(key);
  if (!match) return null;
  const value = Number(match[2]);
  if (match[1] === "mrr")
    return (MRR_MILESTONES as readonly number[]).includes(value)
      ? { kind: "mrr", usd: value }
      : null;
  return (RANK_MILESTONES as readonly number[]).includes(value)
    ? { kind: "rank", place: value }
    : null;
}

/** Short, for a card or a subject: "$10K MRR", "Top 10", "#1". */
export function milestoneHeadline(milestone: Milestone) {
  if (milestone.kind === "mrr") return `${compactUsd(milestone.usd * 100)} MRR`;
  return milestone.place === 1 ? "#1" : `Top ${milestone.place}`;
}

/** What was reached, after "reached": "$10K MRR", "the top 10", "first place". */
export function milestoneObject(milestone: Milestone) {
  if (milestone.kind === "mrr") return `${compactUsd(milestone.usd * 100)} MRR`;
  return milestone.place === 1 ? "first place" : `the top ${milestone.place}`;
}

/** A full sentence about the product and the milestone. */
export function milestoneSentence(milestone: Milestone, name: string) {
  if (milestone.kind === "mrr")
    return `${name} reached ${formatUsd(milestone.usd * 100)} in monthly recurring revenue.`;
  return milestone.place === 1
    ? `${name} reached first place on the leaderboard of verified revenue on ${SITE_NAME}.`
    : `${name} reached the top ${milestone.place} on the leaderboard of verified revenue on ${SITE_NAME}.`;
}

/**
 * The milestones worth naming out of several reached at once: the best place, and the highest
 * threshold. The first is the one to lead with, as places are rarer.
 */
export function notableMilestones(keys: string[]): Milestone[] {
  const reached = keys.map(parseMilestone).filter((item) => item !== null);
  const places = reached.flatMap((item) => (item.kind === "rank" ? [item.place] : []));
  const amounts = reached.flatMap((item) => (item.kind === "mrr" ? [item.usd] : []));
  return [
    ...(places.length ? [{ kind: "rank" as const, place: Math.min(...places) }] : []),
    ...(amounts.length ? [{ kind: "mrr" as const, usd: Math.max(...amounts) }] : []),
  ];
}

/** The text of a post about the milestone, written for the founder to share. */
export function shareText(milestone: Milestone, name: string) {
  if (milestone.kind === "mrr")
    return `${name} just reached ${milestoneObject(milestone)}, verified on ${SITE_NAME}.`;
  return `${name} is now ${milestone.place === 1 ? "#1" : `in the top ${milestone.place}`} on ${SITE_NAME}'s leaderboard of verified revenue.`;
}

/** A milestone's page, relative to the site. */
export function milestonePath(slug: string, milestone: Milestone) {
  return `/saas/${slug}/milestones/${milestoneKey(milestone)}`;
}
