import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { findSaas, publicProfile } from "@/lib/data";
import { formatUsd } from "@/lib/domain";
import { currentUser } from "@/lib/supabase/server";
import { pageMetadata } from "@/lib/seo";
import { productJsonLd } from "@/lib/structured-data";
import { JsonLd } from "@/components/json-ld";
import { ProductProfile } from "@/components/product-profile";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await findSaas((await params).slug);
  if (!found || "redirect" in found) return {};
  const { item } = found;
  if (!item.name || !item.tagline) return {};
  // Shared, fresh MRR goes into the title and description, as search results and links show it.
  const mrr =
    item.revenue_status === "verified" && item.mrr_cents != null ? formatUsd(item.mrr_cents) : null;
  const customers =
    item.customers != null
      ? ` from ${item.customers.toLocaleString("en-US")} paying ${item.customers === 1 ? "customer" : "customers"}`
      : "";
  return pageMetadata({
    title: mrr ? `${item.name}: ${mrr} verified MRR` : item.name,
    description: mrr ? `${item.tagline} Verified MRR ${mrr}${customers}.` : item.tagline,
    path: `/saas/${item.slug}`,
    markdown: true,
  });
}

export default async function SaasProfile({ params }: Props) {
  const [found, viewer] = await Promise.all([findSaas((await params).slug), currentUser()]);
  if (!found) notFound();
  // An id, an earlier slug or another letter case moves to the current address.
  if ("redirect" in found) permanentRedirect(found.redirect);
  const item = found.item;
  const maker = item.owner_id ? await publicProfile(item.owner_id) : null;
  return (
    <>
      <JsonLd data={productJsonLd(item)} />
      <ProductProfile
        item={item}
        headline={maker?.headline ?? null}
        viewerId={viewer?.id ?? null}
      />
    </>
  );
}
