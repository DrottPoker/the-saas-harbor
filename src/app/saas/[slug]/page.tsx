import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { findSaas, publicProfile } from "@/lib/data";
import { currentUser } from "@/lib/supabase/server";
import { pageMetadata } from "@/lib/seo";
import { ProductProfile } from "@/components/product-profile";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await findSaas((await params).slug);
  if (!found || "redirect" in found || !found.item.name || !found.item.tagline) return {};
  return pageMetadata({
    title: found.item.name,
    description: found.item.tagline,
    path: `/saas/${found.item.slug}`,
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
    <ProductProfile item={item} headline={maker?.headline ?? null} viewerId={viewer?.id ?? null} />
  );
}
