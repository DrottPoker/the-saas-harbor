import { ImageResponse } from "next/og";
import { findProfile, makerTotals } from "@/lib/data";
import { formatUsd } from "@/lib/domain";
import { excerpt } from "@/lib/moderation";
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
export const alt = "The user's name, headline and verified figures on The SaaS Harbor";

// The key figures the maker page shows: products, and verified figures that are shared.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const found = await findProfile((await params).slug);
  if (!found || "redirect" in found) return siteImage();
  const profile = found.item;
  const totals = await makerTotals(profile.id);
  const figures: HarborFigure[] = [{ label: "Products", value: String(totals.products) }];
  if (totals.mrr.total != null)
    figures.push({ label: "Verified MRR", value: formatUsd(totals.mrr.total) });
  if (totals.customers.total != null)
    figures.push({
      label: "Subscribers",
      value: totals.customers.total.toLocaleString("en-US"),
    });
  if (figures.length < 3 && profile.location)
    figures.push({ label: "Based in", value: excerpt(profile.location, 22) });
  return new ImageResponse(
    <HarborCard footer={<HarborFigures figures={figures} />}>
      <HarborHeading
        title={profile.name}
        subtitle={profile.headline || profile.bio}
        picture={
          <OgPicture path={profile.avatar_path} name={profile.name} round theme="dark" size={144} />
        }
      />
    </HarborCard>,
    size,
  );
}
