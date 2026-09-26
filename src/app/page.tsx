import type { Metadata } from "next";
import { Explore } from "@/components/explore";
import { JsonLd } from "@/components/json-ld";
import { firstValues, type SearchParams } from "@/lib/params";
import { listMetadata, SITE_NAME } from "@/lib/seo";
import { siteJsonLd } from "@/lib/structured-data";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const metadata = listMetadata(
    {
      title: "Free SaaS directory and verified MRR leaderboard",
      laterTitle: "Leaderboard",
      description:
        "List your SaaS for free and get a public page with a link to your site. Connect Stripe, Paddle, Polar or Dodo Payments to rank by verified MRR.",
      path: "/",
    },
    firstValues(await searchParams),
  );
  // The root layout's title template covers only the pages below it, so this page adds the name.
  return { ...metadata, title: `${metadata.title} | ${SITE_NAME}` };
}

export default async function Home({ searchParams }: Props) {
  return (
    <>
      <JsonLd data={siteJsonLd()} />
      <Explore mode="ranked" params={firstValues(await searchParams)} />
    </>
  );
}
