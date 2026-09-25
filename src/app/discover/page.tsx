import { Explore } from "@/components/explore";
import { firstValues, type SearchParams } from "@/lib/params";
export const metadata = { title: "Browse SaaS", alternates: { canonical: "/discover" } };
export default async function Discover({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <Explore mode="discover" params={firstValues(await searchParams)} />;
}
