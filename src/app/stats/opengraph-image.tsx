import { ImageResponse } from "next/og";
import { HarborCard, HarborFigures, HarborHeading, OG_SIZE, siteImage } from "@/components/og-card";
import { directoryStats } from "@/lib/data";
import { formatUsd } from "@/lib/domain";
import { STATS_MINIMUM } from "@/lib/stats";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "Statistics on The SaaS Harbor: monthly recurring revenue verified across products";
// The figures are live, so the image is drawn per request rather than at build time.
export const dynamic = "force-dynamic";

export default async function Image() {
  const stats = await directoryStats();
  // With too few products the page shows no figures, so neither does its card.
  if (stats.ranked < STATS_MINIMUM || stats.median_mrr_cents == null) return siteImage();
  return new ImageResponse(
    <HarborCard
      footer={
        <HarborFigures
          figures={[
            { label: "Combined MRR", value: formatUsd(stats.mrr_cents) },
            { label: "Median MRR", value: formatUsd(stats.median_mrr_cents) },
            { label: "Products ranked", value: stats.ranked.toLocaleString("en-US") },
          ]}
        />
      }
    >
      <HarborHeading
        title="Verified MRR in numbers"
        subtitle={`${formatUsd(stats.mrr_cents)} in monthly recurring revenue across ${stats.ranked.toLocaleString("en-US")} independent SaaS products.`}
      />
    </HarborCard>,
    OG_SIZE,
  );
}
