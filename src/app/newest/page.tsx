import { Explore } from "@/components/explore";
export const metadata = { title: "New arrivals" };
export default async function Newest({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <Explore mode="newest" params={await searchParams} />;
}
