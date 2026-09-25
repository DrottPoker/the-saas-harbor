import { Explore } from "@/components/explore";
import { JsonLd } from "@/components/json-ld";
import { firstValues, type SearchParams } from "@/lib/params";
import { websiteJsonLd } from "@/lib/structured-data";
// Search and filter variants point search engines at the plain leaderboard.
export const metadata = { alternates: { canonical: "/" } };
export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <>
      <JsonLd data={websiteJsonLd()} />
      <Explore mode="ranked" params={firstValues(await searchParams)} />
    </>
  );
}
