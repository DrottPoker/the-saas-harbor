import type { Metadata } from "next";
import { Explore } from "@/components/explore";
import { JsonLd } from "@/components/json-ld";
import { firstValues, type SearchParams } from "@/lib/params";
import { rankingFrom, revenueWindow } from "@/lib/revenue-figures";
import { listMetadata, SITE_NAME } from "@/lib/seo";
import { siteJsonLd } from "@/lib/structured-data";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = firstValues(await searchParams);
  // Each revenue ranking is a page of its own.
  const revenue = revenueWindow(rankingFrom(params.by));
  const metadata = listMetadata(
    revenue
      ? {
          title: `SaaS ranked by verified revenue, ${revenue.short.toLowerCase()}`,
          description: `Independent SaaS products ranked by the revenue their payment provider verifies ${revenue.ranking === "all" ? "since their first payment" : `for the last ${revenue.short}`}, one-time purchases included.`,
          path: `/?by=${revenue.ranking}`,
        }
      : {
          title: "Free SaaS directory and verified MRR leaderboard",
          laterTitle: "Leaderboard",
          description:
            "List your SaaS for free and get a public page with a link to your site. Connect Stripe, Paddle, RevenueCat or another payment provider to rank by verified MRR.",
          path: "/",
        },
    params,
  );
  // An absolute title adds the name itself, whether or not the root layout's template applies to
  // this page (it does since the @modal slot sits beside it).
  return { ...metadata, title: { absolute: `${metadata.title} | ${SITE_NAME}` } };
}

export default async function Home({ searchParams }: Props) {
  return (
    <>
      <JsonLd data={siteJsonLd()} />
      <Explore mode="ranked" params={firstValues(await searchParams)} />
    </>
  );
}
