import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Explore } from "@/components/explore";
import { JsonLd } from "@/components/json-ld";
import { revenueRankedCounts } from "@/lib/data";
import { firstValues, type SearchParams } from "@/lib/params";
import { rankingFrom, revenueWindow } from "@/lib/revenue-figures";
import { listMetadata, SITE_NAME } from "@/lib/seo";
import { siteJsonLd } from "@/lib/structured-data";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const [params, t, common] = await Promise.all([
    searchParams.then(firstValues),
    getTranslations("home.meta"),
    getTranslations("common"),
  ]);
  // Each revenue ranking is a page of its own.
  const revenue = revenueWindow(rankingFrom(params.by));
  const metadata = await listMetadata(
    revenue
      ? {
          title: common(`windows.${revenue.ranking}.title`),
          description:
            revenue.ranking === "all"
              ? t("revenueDescriptionAll")
              : t("revenueDescription", { window: t(`window${revenue.ranking}`) }),
          path: `/?by=${revenue.ranking}`,
        }
      : {
          title: t("title"),
          laterTitle: t("laterTitle"),
          description: t("description"),
          path: "/",
        },
    params,
  );
  // An empty revenue ranking has nothing for search engines yet.
  if (revenue && !metadata.robots && !(await revenueRankedCounts()).get(revenue.ranking))
    metadata.robots = { index: false };
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
