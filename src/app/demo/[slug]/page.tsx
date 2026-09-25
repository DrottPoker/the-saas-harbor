import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { demoProduct } from "@/lib/data";
import { ProductProfile } from "@/components/product-profile";

type Props = { params: Promise<{ slug: string }> };

// A made-up product from src/lib/demo.ts. Search engines are kept away, so a demo never shows up
// in results as if it were a real company.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = await demoProduct((await params).slug);
  if (!item) return {};
  return {
    title: `${item.name} (demo)`,
    description: item.tagline,
    robots: { index: false, follow: false },
  };
}

export default async function DemoProduct({ params }: Props) {
  const item = await demoProduct((await params).slug);
  if (!item) notFound();
  return <ProductProfile item={item} headline={item.demo?.headline ?? null} viewerId={null} />;
}
