import { Explore } from "@/components/explore";
import { firstValues, type SearchParams } from "@/lib/params";
export const metadata = { title: "New arrivals", alternates: { canonical: "/newest" } };
export default async function Newest({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <Explore mode="newest" params={firstValues(await searchParams)} />;
}
