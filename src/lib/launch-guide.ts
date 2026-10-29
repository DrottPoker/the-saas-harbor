// The guide at /where-to-launch: places founders list and launch a new SaaS. The text of each
// group, place, step and caution is in the whereToLaunch messages, under the keys below. Each
// entry says only what the site's own pages said on GUIDE_CHECKED, and leaves out prices, which
// change often. Update an entry in every language when a site changes its terms, and move the date.

import type en from "@/messages/en";

export const GUIDE_PUBLISHED = "2026-09-27";
export const GUIDE_CHECKED = "2026-09-27";

type Messages = (typeof en)["whereToLaunch"];
type PlaceKey = keyof Messages["places"];
/** The places whose text includes a tip. */
type TipKey = {
  [Key in PlaceKey]: Messages["places"][Key] extends { tip: string } ? Key : never;
}[PlaceKey];

/**
 * A place, with its text in whereToLaunch.places under `key`, which also names its heading. `tip`
 * marks the places whose text has a tip, which the types check against the English messages.
 */
export type LaunchPlace = {
  name: string;
  /** An absolute address, or a path on this site when `internal` is set. */
  url: string;
  internal?: boolean;
} & ({ key: TipKey; tip: true } | { key: Exclude<PlaceKey, TipKey>; tip?: undefined });

export type LaunchGroup = {
  /** The id of its heading, which addresses can link to. */
  id: string;
  /** Its title and introduction in whereToLaunch.groups. */
  key: keyof Messages["groups"];
  places: LaunchPlace[];
};

/** The steps of a launch, in order, as keys in whereToLaunch.order. */
export const launchOrder = [
  "waitingList",
  "directories",
  "communities",
  "launchDay",
  "reviews",
] as const satisfies (keyof Messages["order"])[];

const launchDays: LaunchGroup = {
  id: "launch-days",
  key: "launchDays",
  places: [
    {
      key: "productHunt",
      name: "Product Hunt",
      url: "https://www.producthunt.com/launch",
      tip: true,
    },
    {
      key: "peerlist",
      name: "Peerlist Launchpad",
      url: "https://help.peerlist.io/individual/launchpad/introduction",
      tip: true,
    },
    { key: "uneed", name: "Uneed", url: "https://www.uneed.best/how-it-works", tip: true },
    { key: "microlaunch", name: "Microlaunch", url: "https://microlaunch.net" },
    { key: "devhunt", name: "DevHunt", url: "https://devhunt.org/the-story" },
  ],
};

const communities: LaunchGroup = {
  id: "communities",
  key: "communities",
  places: [
    {
      key: "showHn",
      name: "Hacker News (Show HN)",
      url: "https://news.ycombinator.com/showhn.html",
      tip: true,
    },
    {
      key: "indieHackers",
      name: "Indie Hackers",
      url: "https://www.indiehackers.com/products",
      tip: true,
    },
    { key: "reddit", name: "Reddit", url: "https://www.reddit.com/r/SaaS", tip: true },
  ],
};

const directories: LaunchGroup = {
  id: "directories",
  key: "directories",
  places: [
    {
      key: "theSaasHarbor",
      name: "The SaaS Harbor",
      url: "/list-your-saas",
      internal: true,
      tip: true,
    },
    {
      key: "saashub",
      name: "SaaSHub",
      url: "https://www.saashub.com/services/submit",
      tip: true,
    },
    {
      key: "alternativeto",
      name: "AlternativeTo",
      url: "https://alternativeto.net/faq/",
      tip: true,
    },
    { key: "betalist", name: "BetaList", url: "https://betalist.com/criteria", tip: true },
    { key: "taaft", name: "There's An AI For That", url: "https://theresanaiforthat.com/launch/" },
    { key: "trustmrr", name: "TrustMRR", url: "https://trustmrr.com/faq" },
  ],
};

const reviewSites: LaunchGroup = {
  id: "review-sites",
  key: "reviewSites",
  places: [
    { key: "g2", name: "G2", url: "https://sell.g2.com/create-a-profile", tip: true },
    { key: "capterra", name: "Capterra", url: "https://www.capterra.com/vendors/", tip: true },
  ],
};

export const launchGroups: LaunchGroup[] = [launchDays, communities, directories, reviewSites];

/**
 * Mistakes that cost more than they bring, with Google's own rules as the source, as keys in
 * whereToLaunch.cautions.
 */
export const launchCautions = [
  "paidLinks",
  "bulkDirectories",
  "unchecked",
  "stale",
] as const satisfies (keyof Messages["cautions"])[];

export const SPAM_POLICIES_URL =
  "https://developers.google.com/search/docs/essentials/spam-policies";
