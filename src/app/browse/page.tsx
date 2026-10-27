import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Explore } from "@/components/explore";
import { firstValues, type SearchParams } from "@/lib/params";
import { listMetadata, SITE_NAME } from "@/lib/seo";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const [params, t] = await Promise.all([
    searchParams.then(firstValues),
    getTranslations("lists.browse"),
  ]);
  return listMetadata(
    { title: t("title"), description: t("description", { site: SITE_NAME }), path: "/browse" },
    params,
  );
}

export default async function Browse({ searchParams }: Props) {
  return <Explore mode="discover" params={firstValues(await searchParams)} />;
}
