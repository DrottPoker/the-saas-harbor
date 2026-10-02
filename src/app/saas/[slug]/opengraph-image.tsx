import { ImageResponse } from "next/og";
import { findSaas } from "@/lib/data";
import { formatUsd } from "@/lib/domain";
import { excerpt } from "@/lib/moderation";
import { isProviderId } from "@/lib/revenue/catalog";
import {
  HarborCard,
  type HarborFigure,
  HarborFigures,
  HarborHeading,
  OG_SIZE,
  OgPicture,
  siteImage,
} from "@/components/og-card";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "The product's name, tagline and verified revenue on The SaaS Harbor";

// Only what the product page shows publicly: shared, fresh figures.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const found = await findSaas((await params).slug);
  if (!found || "redirect" in found) return siteImage();
  const item = found.item;
  const name = item.name ?? "Product";
  const figures: HarborFigure[] = [];
  if (item.revenue_status === "verified" && item.mrr_cents != null)
    figures.push({
      label: "Verified MRR",
      value: formatUsd(item.mrr_cents),
      provider: isProviderId(item.provider) ? item.provider : undefined,
    });
  if (item.customers != null)
    figures.push({ label: "Paying customers", value: item.customers.toLocaleString("en-US") });
  figures.push({ label: "Category", value: item.category ?? "Other" });
  if (figures.length < 3)
    figures.push({ label: "Founder", value: excerpt(item.owner_name ?? "", 22) });
  return new ImageResponse(
    <HarborCard footer={<HarborFigures figures={figures} />}>
      <HarborHeading
        title={name}
        subtitle={item.tagline}
        picture={<OgPicture path={item.logo_path} name={name} theme="dark" size={144} />}
      />
    </HarborCard>,
    size,
  );
}
