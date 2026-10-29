import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { demoProduct } from "@/lib/data";
import { translateDemos } from "@/lib/demo";
import { ProductProfile } from "@/components/product-profile";

type Props = { params: Promise<{ slug: string }> };

/** A demo product with its text in the page's language. */
async function load(slug: string) {
  const item = await demoProduct(slug);
  return item ? (await translateDemos([item]))[0]! : null;
}

// A made-up product from src/lib/demo.ts. Search engines are kept away, so a demo never shows up
// in results as if it were a real company.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = await load((await params).slug);
  if (!item) return {};
  const t = await getTranslations("product.demo");
  return {
    title: t("metaTitle", { name: item.name ?? "" }),
    description: item.tagline,
    robots: { index: false, follow: false },
  };
}

export default async function DemoProduct({ params }: Props) {
  const item = await load((await params).slug);
  if (!item) notFound();
  return <ProductProfile item={item} headline={item.demo?.headline ?? null} viewerId={null} />;
}
