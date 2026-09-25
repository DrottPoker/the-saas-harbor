import { ImageResponse } from "next/og";
import { OG_SIZE, OgCard, OgMark, siteImage } from "@/components/og-card";
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
    <OgCard
      title="Verified MRR in numbers"
      subtitle={`${formatUsd(stats.mrr_cents)} in monthly recurring revenue across ${stats.ranked.toLocaleString("en-US")} independent SaaS products.`}
      picture={<OgMark size={160} />}
      figures={[
        ["Combined MRR", formatUsd(stats.mrr_cents)],
        ["Median MRR", formatUsd(stats.median_mrr_cents)],
        ["Products ranked", stats.ranked.toLocaleString("en-US")],
      ]}
    />,
    OG_SIZE,
  );
}
