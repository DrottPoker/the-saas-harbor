import { Explore } from "@/components/explore";
// Search and filter variants point search engines at the plain leaderboard.
export const metadata = { alternates: { canonical: "/" } };
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <Explore mode="ranked" params={await searchParams} />;
}
