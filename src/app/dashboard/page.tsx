import Link from "@/components/link";
import { Circle, CircleCheck, Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { LOCALE_INFO } from "@/i18n/config";
import { requireUser } from "@/lib/supabase/server";
import { ProductLogo } from "@/components/avatars";
import { Badge } from "@/components/badge";
import { ClientMessages } from "@/components/client-messages";
import { ModerationNotice } from "@/components/moderation-notice";
import { EmptyState, Notice, PageHeader, Shell } from "@/components/shell";
import { SharePrompt } from "@/components/share-prompt";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/display-money";
import { newProductId } from "@/lib/new-product";
import { firstValues, type SearchParams } from "@/lib/params";
import { SITE_NAME, siteUrl } from "@/lib/seo";
import { productShareText } from "@/lib/share";

export async function generateMetadata() {
  const t = await getTranslations("dashboard.meta");
  return { title: t("title") };
}

async function RevenueBadge({ status }: { status: string | undefined }) {
  const t = await getTranslations("dashboard.products");
  const [label, tone] =
    status === "ok"
      ? ([t("verified"), "success"] as const)
      : status === "error"
        ? ([t("syncFailed"), "error"] as const)
        : ([t("notVerified"), "neutral"] as const);
  return (
    <Badge tone={tone} className="hidden sm:inline-flex">
      {label}
    </Badge>
  );
}

type StepKey = "list" | "logo" | "profile" | "connect" | "domain";
type Step = { key: StepKey; done: boolean; href: string };

/** What makes a founder's listing complete, ticked off as it is done; gone once all are. */
async function NextSteps({ steps }: { steps: Step[] }) {
  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) return null;
  const [t, locale] = await Promise.all([getTranslations("dashboard.nextSteps"), getLocale()]);
  const count = (value: number) => formatCount(value, LOCALE_INFO[locale].intl);
  return (
    <section
      aria-labelledby="next-steps"
      className="mb-8 rounded-xl border bg-surface p-5 shadow-card sm:p-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="next-steps" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <span className="text-sm text-muted-foreground">
          {t("progress", { done: count(done), total: count(steps.length) })}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      <ol className="mt-4 grid gap-3">
        {steps.map((step) => (
          <li key={step.key} className="flex items-center gap-3 text-sm">
            {step.done ? (
              <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-brand" />
            ) : (
              <Circle aria-hidden="true" className="size-5 shrink-0 text-faint-foreground" />
            )}
            <span className={step.done ? "flex-1 text-muted-foreground" : "flex-1"}>
              {t(`${step.key}.label`)}
              {step.done && <span className="sr-only"> {t("done")}</span>}
            </span>
            {!step.done && (
              <Link
                href={step.href}
                className="shrink-0 font-medium underline underline-offset-2 hover:text-brand"
              >
                {t(`${step.key}.action`)}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [{ user, client }, t, share, locale] = await Promise.all([
    requireUser(),
    getTranslations("dashboard"),
    getTranslations("dashboard.share"),
    getLocale(),
  ]);
  const params = firstValues(await searchParams);
  const [
    { data: profile, error: profileError },
    { data: products, error },
    { data: connections, error: connectionError },
  ] = await Promise.all([
    client
      .from("profiles")
      .select("suspended_at, suspended_reason, suspended_note, avatar_path, headline")
      .eq("id", user.id)
      .maybeSingle(),
    client
      .from("saas")
      .select("id,slug,name,tagline,logo_path,hidden_at,verified_domain,listing_pending")
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
      ? products?.find(
          (product) => product.id === newProduct && !product.hidden_at && !product.listing_pending,
        )
      : undefined;
  // The first product each step still needs, so its link leads straight to the work.
  const editor = (missing: (product: NonNullable<typeof products>[number]) => boolean) => {
    const product = products?.find(missing) ?? products?.[0];
    return product ? `/dashboard/saas/${product.id}` : "/dashboard/saas/new";
  };
  const steps: Step[] = [
    { key: "list", done: true, href: "/dashboard/saas/new" },
    {
      key: "logo",
      done: !!products?.every((product) => product.logo_path),
      href: editor((product) => !product.logo_path),
    },
    {
      key: "profile",
      done: !!profile?.avatar_path && !!profile?.headline,
      href: "/dashboard/profile",
    },
    {
      key: "connect",
      done: [...revenueStatus.values()].includes("ok"),
      href: `${editor((product) => !revenueStatus.has(product.id))}#revenue`,
    },
    {
      key: "domain",
      done: !!products?.some((product) => product.verified_domain),
      href: `${editor((product) => !product.verified_domain)}#domain`,
    },
  ];
  const addButton = (
    <Button asChild>
      <Link href="/dashboard/saas/new">
        <Plus />
        {t("addSaas")}
      </Link>
    </Button>
  );

  return (
    <Shell>
      <PageHeader title={t("title")} description={t("description")} actions={addButton} />
      {added && (
        <ClientMessages namespaces={["dashboard"]}>
          <SharePrompt
            name={added.name}
            url={`${siteUrl()}/saas/${added.slug}`}
            path={`/saas/${added.slug}`}
            text={productShareText(
              added.name,
              added.tagline,
              share("post", { name: added.name, site: SITE_NAME }),
            )}
          />
        </ClientMessages>
      )}
      {params.saved && (
        <Notice tone="success" className="mb-6">
          {t("notices.saved")}
        </Notice>
      )}
      {params.added && (
        <Notice tone="success" className="mb-6">
          {t("notices.added")}
        </Notice>
      )}
      {params.deleted && (
        <Notice tone="success" className="mb-6">
          {t("notices.deleted")}
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
      {!!products?.length && !suspended && <NextSteps steps={steps} />}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 id="products" className="text-lg font-semibold">
            {t("products.title")}
          </h2>
          <span className="text-sm text-muted-foreground">
            {t("products.total", {
              count: formatCount(products?.length ?? 0, LOCALE_INFO[locale].intl),
            })}
          </span>
        </div>
        {!products?.length ? (
          <EmptyState title={t("products.emptyTitle")} action={addButton}>
            {t("products.emptyBody")}
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
                  <h3 dir="auto" className="truncate font-medium">
                    {product.name}
                  </h3>
                  <p dir="auto" className="truncate text-sm text-muted-foreground">
                    {product.tagline}
                  </p>
                </div>
                {product.hidden_at ? (
                  <Badge tone="error">{t("products.hidden")}</Badge>
                ) : product.listing_pending ? (
                  <Badge>{t("products.pendingConnection")}</Badge>
                ) : (
                  <RevenueBadge status={revenueStatus.get(product.id)} />
                )}
                <div className="flex shrink-0 gap-1">
                  {!product.hidden_at && !product.listing_pending && !suspended && (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/saas/${product.slug}`}>{t("products.view")}</Link>
                    </Button>
                  )}
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/saas/${product.id}`}>{t("products.edit")}</Link>
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
