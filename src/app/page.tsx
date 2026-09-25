import { Explore } from "@/components/explore";
import { firstValues, type SearchParams } from "@/lib/params";
// Search and filter variants point search engines at the plain leaderboard.
export const metadata = { alternates: { canonical: "/" } };
export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <Explore mode="ranked" params={firstValues(await searchParams)} />;
}
