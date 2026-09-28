import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { findSaas, publicProfile } from "@/lib/data";
import { currentUser, serverClient } from "@/lib/supabase/server";
import { pageMetadata, productSummary } from "@/lib/seo";
import { productJsonLd } from "@/lib/structured-data";
import { JsonLd } from "@/components/json-ld";
import { ProductProfile } from "@/components/product-profile";

type Props = { params: Promise<{ slug: string }> };

/** How often the page was viewed, for its founder. A failure leaves the numbers out. */
async function pageViews(saasId: string) {
  const client = await serverClient();
  const { data, error } = await client.rpc("saas_page_view_counts", { p_saas: saasId }).single();
  if (error) {
    console.error("Page views could not be loaded:", error.code);
    return null;
  }
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await findSaas((await params).slug);
  if (!found || "redirect" in found) return {};
  const { item } = found;
  if (!item.name || !item.tagline) return {};
  return pageMetadata({
    ...productSummary(item),
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
  // The founder also sees how often the page was viewed.
  const ownId = viewer && item.id && viewer.id === item.owner_id ? item.id : null;
  const [maker, views] = await Promise.all([
    item.owner_id ? publicProfile(item.owner_id) : null,
    ownId ? pageViews(ownId) : null,
  ]);
  return (
    <>
      <JsonLd data={productJsonLd(item)} />
      <ProductProfile
        item={item}
        headline={maker?.headline ?? null}
        viewerId={viewer?.id ?? null}
        views={views}
      />
    </>
  );
}
