import { Explore } from "@/components/explore";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <Explore mode="ranked" params={await searchParams} />;
}
