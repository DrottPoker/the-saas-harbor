import type { Metadata } from "next";
import { Explore } from "@/components/explore";
import { firstValues, type SearchParams } from "@/lib/params";
import { listMetadata } from "@/lib/seo";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return listMetadata(
    {
      title: "New SaaS products",
      description: "The latest independent SaaS products listed on The SaaS Harbor, newest first.",
      path: "/newest",
    },
    firstValues(await searchParams),
  );
}

export default async function Newest({ searchParams }: Props) {
  return <Explore mode="newest" params={firstValues(await searchParams)} />;
}
