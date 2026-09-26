import type { Metadata } from "next";
import { Explore } from "@/components/explore";
import { firstValues, type SearchParams } from "@/lib/params";
import { listMetadata } from "@/lib/seo";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return listMetadata(
    {
      title: "Browse SaaS products",
      description:
        "Every independent SaaS product listed on The SaaS Harbor, A to Z, including those that keep their revenue private.",
      path: "/discover",
    },
    firstValues(await searchParams),
  );
}

export default async function Discover({ searchParams }: Props) {
  return <Explore mode="discover" params={firstValues(await searchParams)} />;
}
