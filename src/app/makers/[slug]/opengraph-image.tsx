import { ImageResponse } from "next/og";
import { findProfile, makerTotals } from "@/lib/data";
import { formatUsd } from "@/lib/domain";
import { excerpt } from "@/lib/moderation";
import { OG_SIZE, OgCard, OgPicture, siteImage } from "@/components/og-card";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "The maker's name, headline and verified figures on The SaaS Harbor";

// The key figures the maker page shows: products, and verified figures that are shared.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const found = await findProfile((await params).slug);
  if (!found || "redirect" in found) return siteImage();
  const profile = found.item;
  const totals = await makerTotals(profile.id);
  const figures: [string, string][] = [["Products", String(totals.products)]];
  if (totals.mrr.total != null) figures.push(["Verified MRR", formatUsd(totals.mrr.total)]);
  if (totals.customers.total != null)
    figures.push(["Paying customers", totals.customers.total.toLocaleString("en-US")]);
  if (figures.length < 3 && profile.location)
    figures.push(["Based in", excerpt(profile.location, 28)]);
  return new ImageResponse(
    <OgCard
      title={excerpt(profile.name, 48)}
      subtitle={excerpt(profile.headline || profile.bio, 110)}
      picture={<OgPicture path={profile.avatar_path} name={profile.name} round />}
      figures={figures}
    />,
    size,
  );
}
