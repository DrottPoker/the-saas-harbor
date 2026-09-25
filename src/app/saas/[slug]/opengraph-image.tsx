import { ImageResponse } from "next/og";
import { findSaas } from "@/lib/data";
import { formatUsd } from "@/lib/domain";
import { excerpt } from "@/lib/moderation";
import { OG_SIZE, OgCard, OgPicture, siteImage } from "@/components/og-card";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "The product's name, tagline and verified revenue on The SaaS Harbor";

// Only what the product page shows publicly: shared, fresh figures.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const found = await findSaas((await params).slug);
  if (!found || "redirect" in found) return siteImage();
  const item = found.item;
  const name = item.name ?? "Product";
  const figures: [string, string][] = [];
  if (item.revenue_status === "verified" && item.mrr_cents != null)
    figures.push(["Verified MRR", formatUsd(item.mrr_cents)]);
  if (item.customers != null)
    figures.push(["Paying customers", item.customers.toLocaleString("en-US")]);
  figures.push(["Category", item.category ?? "Other"]);
  if (figures.length < 3) figures.push(["Founder", excerpt(item.owner_name ?? "", 28)]);
  return new ImageResponse(
    <OgCard
      title={excerpt(name, 48)}
      subtitle={excerpt(item.tagline ?? "", 110)}
      picture={<OgPicture path={item.logo_path} name={name} />}
      figures={figures}
    />,
    size,
  );
}
