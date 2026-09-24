import Link from "next/link";
import { Plus } from "lucide-react";
import { signOut } from "@/app/actions";
import { requireUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { PersonAvatar, ProductLogo } from "@/components/avatars";
import { EmptyState, Notice, PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Dashboard" };

function StripeBadge({ status }: { status: string | undefined }) {
  const [label, tone] =
    status === "ok"
      ? ["Verified", "border-success-border text-success"]
      : status === "error"
        ? ["Sync failed", "border-error-border text-error"]
        : ["Not verified", "text-muted-foreground"];
  return (
    <span className={cn("hidden shrink-0 rounded-full border px-2 py-0.5 text-xs sm:inline", tone)}>
      {label}
    </span>
  );
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { user, client } = await requireUser();
  const params = await searchParams;
  const [
    { data: profile, error: profileError },
    { data: products, error },
    { data: connections, error: connectionError },
  ] = await Promise.all([
    client.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    client
      .from("saas")
      .select("id,name,tagline,logo_path")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false }),
    client.from("stripe_connections").select("saas_id, status").eq("owner_id", user.id),
  ]);
  if (error || profileError || connectionError)
    throw new Error("Your dashboard could not be loaded.");
  const stripeStatus = new Map(connections?.map((row) => [row.saas_id, row.status]));
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
      <PageHeader
        title="Dashboard"
        description="Manage your maker profile and products."
        actions={addButton}
      />
      {params.saved && (
        <Notice tone="success" className="mb-6">
          Saved. The public product page is up to date.
        </Notice>
      )}

      <section className="flex flex-col gap-4 rounded-xl border bg-surface p-5 sm:flex-row sm:items-center">
        <PersonAvatar path={profile?.avatar_path} name={profile?.name ?? "?"} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{profile?.name ?? "Set up your profile"}</h2>
          <p className="truncate text-sm text-muted-foreground">
            {profile
              ? profile.bio || "No bio yet."
              : "Add your name and a short bio. Your maker profile is public."}
          </p>
        </div>
        <div className="flex gap-2">
          {profile && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/makers/${user.id}`}>View public profile</Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/profile">Edit profile</Link>
          </Button>
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 id="products" className="text-lg font-semibold">
            Your products
          </h2>
          <span className="text-sm text-muted-foreground">{products?.length ?? 0} total</span>
        </div>
        {!products?.length ? (
          <EmptyState title="No products yet" action={addButton}>
            Add a product to list it in the directory. Revenue stays private unless you share it.
          </EmptyState>
        ) : (
          <ul aria-labelledby="products" className="divide-y rounded-xl border bg-surface">
            {products.map((product) => (
              <li key={product.id} className="flex items-center gap-4 p-4">
                <ProductLogo path={product.logo_path} name={product.name} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium">{product.name}</h3>
                  <p className="truncate text-sm text-muted-foreground">{product.tagline}</p>
                </div>
                <StripeBadge status={stripeStatus.get(product.id)} />
                <div className="flex shrink-0 gap-1">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/saas/${product.id}`}>View</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/saas/${product.id}`}>Edit</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* The header hides sign-out on small screens. */}
      <form action={signOut} className="mt-10 md:hidden">
        <Button type="submit" variant="outline" className="w-full">
          Sign out
        </Button>
      </form>
    </Shell>
  );
}
