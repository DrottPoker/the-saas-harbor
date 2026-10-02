import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { ProductLogo } from "@/components/avatars";
import { Badge } from "@/components/badge";
import { ModerationNotice } from "@/components/moderation-notice";
import { EmptyState, Notice, PageHeader, Shell } from "@/components/shell";
import { SharePrompt } from "@/components/share-prompt";
import { Button } from "@/components/ui/button";
import { newProductId } from "@/lib/new-product";
import { firstValues, type SearchParams } from "@/lib/params";
import { siteUrl } from "@/lib/seo";
import { productShareText } from "@/lib/share";

export const metadata = { title: "Dashboard" };

function RevenueBadge({ status }: { status: string | undefined }) {
  const [label, tone] =
    status === "ok"
      ? (["Verified", "success"] as const)
      : status === "error"
        ? (["Sync failed", "error"] as const)
        : (["Not verified", "neutral"] as const);
  return (
    <Badge tone={tone} className="hidden sm:inline-flex">
      {label}
    </Badge>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { user, client } = await requireUser();
  const params = firstValues(await searchParams);
  const [
    { data: profile, error: profileError },
    { data: products, error },
    { data: connections, error: connectionError },
  ] = await Promise.all([
    client
      .from("profiles")
      .select("suspended_at, suspended_reason, suspended_note")
      .eq("id", user.id)
      .maybeSingle(),
    client
      .from("saas")
      .select("id,slug,name,tagline,logo_path,hidden_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false }),
    client.from("revenue_connections").select("saas_id, status").eq("owner_id", user.id),
  ]);
  if (error || profileError || connectionError)
    throw new Error("Your dashboard could not be loaded.");
  const revenueStatus = new Map(connections?.map((row) => [row.saas_id, row.status]));
  const suspended = !!profile?.suspended_at;
  // A product just added without a payment provider lands here, with the offer to share it.
  const newProduct = await newProductId();
  const added =
    newProduct && params.added === newProduct && !suspended
      ? products?.find((product) => product.id === newProduct && !product.hidden_at)
      : undefined;
  const addButton = (
    <Button asChild>
      <Link href="/dashboard/saas/new">
        <Plus />
        Add SaaS
      </Link>
    </Button>
  );

  return (
    <Shell>
      <PageHeader title="Dashboard" description="Manage your products." actions={addButton} />
      {added && (
        <SharePrompt
          name={added.name}
          url={`${siteUrl()}/saas/${added.slug}`}
          text={productShareText(added.name, added.tagline)}
        />
      )}
      {params.saved && (
        <Notice tone="success" className="mb-6">
          Saved. The public product page is up to date.
        </Notice>
      )}
      {params.added && (
        <Notice tone="success" className="mb-6">
          Product added. Its page is public. You can connect your payment provider from Edit at any
          time.
        </Notice>
      )}
      {params.deleted && (
        <Notice tone="success" className="mb-6">
          Product deleted. It has left the directory and the leaderboard.
        </Notice>
      )}
      {profile?.suspended_at && (
        <ModerationNotice
          kind="account"
          at={profile.suspended_at}
          reason={profile.suspended_reason}
          note={profile.suspended_note}
          className="mb-6"
        />
      )}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 id="products" className="text-lg font-semibold">
            Your products
          </h2>
          <span className="text-sm text-muted-foreground">{products?.length ?? 0} total</span>
        </div>
        {!products?.length ? (
          <EmptyState title="No products yet" action={addButton}>
            Add a product to list it in the directory. Verified revenue is public unless you hide
            it.
          </EmptyState>
        ) : (
          <ul
            aria-labelledby="products"
            className="divide-y rounded-xl border bg-surface shadow-card"
          >
            {products.map((product) => (
              <li key={product.id} className="flex items-center gap-4 p-4">
                <ProductLogo path={product.logo_path} name={product.name} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium">{product.name}</h3>
                  <p className="truncate text-sm text-muted-foreground">{product.tagline}</p>
                </div>
                {product.hidden_at ? (
                  <Badge tone="error">Hidden</Badge>
                ) : (
                  <RevenueBadge status={revenueStatus.get(product.id)} />
                )}
                <div className="flex shrink-0 gap-1">
                  {!product.hidden_at && !suspended && (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/saas/${product.slug}`}>View</Link>
                    </Button>
                  )}
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/saas/${product.id}`}>Edit</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  );
}
