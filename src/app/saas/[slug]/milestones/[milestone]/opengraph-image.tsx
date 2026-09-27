import { ImageResponse } from "next/og";
import { formatDate } from "@/lib/domain";
import { milestoneHeadline, milestoneSentence } from "@/lib/milestones";
import { excerpt } from "@/lib/moderation";
import { providerName } from "@/lib/revenue/catalog";
import { OG_SIZE, OgCard, OgPicture, siteImage } from "@/components/og-card";
import { loadMilestone, type Params } from "./load";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A milestone the product reached, with its verified revenue, on The SaaS Harbor";

// Only while the page shows the milestone: reached, and MRR verified and shared.
export default async function Image({ params }: { params: Params }) {
  const found = await loadMilestone(params);
  if (!found || "redirect" in found) return siteImage();
  const { item, milestone, reachedAt } = found;
  const name = item.name ?? "Product";
  return new ImageResponse(
    <OgCard
      title={milestoneHeadline(milestone)}
      subtitle={excerpt(milestoneSentence(milestone, name), 110)}
      picture={<OgPicture path={item.logo_path} name={name} />}
      figures={[
        ["Product", excerpt(name, 24)],
        ["Reached", formatDate(reachedAt)],
        ["Revenue verified with", providerName(item.provider)],
      ]}
    />,
    size,
  );
}
