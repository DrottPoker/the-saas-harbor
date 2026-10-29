// Milestones a product reaches: an MRR threshold or a place on the leaderboard. The database
// records them (migration 20260927140000_milestones.sql, which lists the same keys); this module
// names them and builds the links to share them. Thresholds are US dollars in every language.
import { createTranslator } from "next-intl";
import english from "@/messages/en/milestones.json";
import { formatCount, formatMoney, usdMoney } from "./display-money";
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

/**
 * The arguments of the milestones messages for a milestone, written for an `Intl` locale: `kind`
 * picks the wording (mrr, first or top), `amount` is the threshold in short US dollars ($10K),
 * `exact` in full ($10,000), and `place` the place in the top.
 */
export function milestoneValues(milestone: Milestone, locale: string) {
  const usd = usdMoney(locale);
  return milestone.kind === "mrr"
    ? {
        kind: "mrr",
        amount: formatMoney(milestone.usd * 100, usd, "compact"),
        exact: formatMoney(milestone.usd * 100, usd),
        place: "",
        site: SITE_NAME,
      }
    : {
        kind: milestone.place === 1 ? "first" : "top",
        amount: "",
        exact: "",
        place: formatCount(milestone.place, locale),
        site: SITE_NAME,
      };
}

// English, for what reads the same for everyone: sharing images and emails.
const en = createTranslator({
  locale: "en",
  messages: { milestones: english },
  namespace: "milestones",
  timeZone: "UTC",
});

/** Short, for a card or a subject: "$10K MRR", "Top 10", "#1". */
export function milestoneHeadline(milestone: Milestone) {
  return en("headline", milestoneValues(milestone, "en-US"));
}

/** What was reached, after "reached": "$10K MRR", "the top 10", "first place". English only. */
export function milestoneObject(milestone: Milestone) {
  if (milestone.kind === "mrr")
    return `${formatMoney(milestone.usd * 100, usdMoney(), "compact")} MRR`;
  return milestone.place === 1 ? "first place" : `the top ${milestone.place}`;
}

/** A full sentence about the product and the milestone. */
export function milestoneSentence(milestone: Milestone, name: string) {
  return en("sentence", { ...milestoneValues(milestone, "en-US"), name });
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
  return en("post", { ...milestoneValues(milestone, "en-US"), name });
}

/** A milestone's page, relative to the site. */
export function milestonePath(slug: string, milestone: Milestone) {
  return `/saas/${slug}/milestones/${milestoneKey(milestone)}`;
}
