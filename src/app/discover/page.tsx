import { Explore } from "@/components/explore";
export const metadata = { title: "Discover", alternates: { canonical: "/discover" } };
export default async function Discover({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <Explore mode="discover" params={await searchParams} />;
}
