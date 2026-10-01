import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { BackLink } from "@/components/back-link";
import { BadgeEmbed } from "@/components/badge-embed";
import { DeleteProduct } from "@/components/delete-forms";
import { DomainVerification } from "@/components/domain-verification";
import { ModerationNotice } from "@/components/moderation-notice";
import { SaasForm } from "@/components/saas-form";
import { Notice, PageHeader, Shell } from "@/components/shell";
import { CONNECTION_COLUMNS, type RevenueConnection } from "@/lib/data";
import { RECORD_LABEL, recordName, recordValue, websiteDomain } from "@/lib/domain-verification";
import { PRODUCT_LIMIT } from "@/lib/moderation";
import { oauthReadyProviders } from "@/lib/revenue/connect";
import { CONNECTION_RESULT_COOKIE, decodeConnectionResult } from "@/lib/revenue/connection-result";
import { currentUser, requireUser } from "@/lib/supabase/server";
import { firstValues, type SearchParams } from "@/lib/params";
import { siteUrl } from "@/lib/seo";
import { currentVerifiedDomain } from "@/lib/website-domain";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
};

export async function generateMetadata({ params }: Pick<Props, "params">) {
  return { title: (await params).id === "new" ? "Add a SaaS" : "Edit SaaS" };
}

export default async function EditSaas({ params, searchParams }: Props) {
  const { id } = await params;
  const isNew = id === "new";
  // Visitors who want to list a product start by creating an account, not by signing in.
  if (isNew && !(await currentUser())) redirect("/auth?mode=signup");
  const { user, client } = await requireUser();
  if (!isNew && !z.uuid().safeParse(id).success) notFound();
  if (isNew) {
    const { count, error } = await client
      .from("saas")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id);
    if (error) throw new Error("Your products could not be loaded.");
    return (
      <Shell size="medium">
        <BackLink href="/dashboard">Dashboard</BackLink>
        <PageHeader
          className="mt-4 border-b"
          title="Add a SaaS"
          description="Product details are public. Connecting your payment provider is optional, and you can do it now or later."
        />
        <div className="pt-8">
          {(count ?? 0) >= PRODUCT_LIMIT ? (
            <Notice>
              You have listed {PRODUCT_LIMIT} products, which is the most an account can have.
              Delete a product to add another.
            </Notice>
          ) : (
            <SaasForm id={crypto.randomUUID()} oauthReady={oauthReadyProviders()} />
          )}
        </div>
      </Shell>
    );
  }

  const [saas, settings, connection, snapshot, verification] = await Promise.all([
    client.from("saas").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle(),
    client.from("saas_settings").select("*").eq("saas_id", id).maybeSingle(),
    client.from("revenue_connections").select(CONNECTION_COLUMNS).eq("saas_id", id).maybeSingle(),
    client
      .from("revenue_snapshots")
      .select("*")
      .eq("saas_id", id)
      .order("captured_at", { ascending: false })
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client.rpc("saas_domain_verification", { p_saas: id }).maybeSingle(),
  ]);
  if (saas.error || settings.error || connection.error || snapshot.error || verification.error)
    throw new Error("Your SaaS could not be loaded.");
  if (!saas.data) notFound();
  const domain = websiteDomain(saas.data.website);
  const token = verification.data?.token;
  const query = firstValues(await searchParams);
  // Connecting a provider returns here with the outcome in a cookie, for this product only.
  const outcome =
    query.connection === "1"
      ? decodeConnectionResult((await cookies()).get(CONNECTION_RESULT_COOKIE)?.value)
      : null;
  const result = outcome?.saasId === id ? outcome : null;
  return (
    <Shell size="medium">
      <BackLink href="/dashboard">Dashboard</BackLink>
      <PageHeader
        className="mt-4 border-b"
        title={`Edit ${saas.data.name}`}
        description="Product details and verified figures are public. You can hide the figures."
      />
      {saas.data.hidden_at && (
        <ModerationNotice
          kind="product"
          at={saas.data.hidden_at}
          reason={saas.data.hidden_reason}
          note={saas.data.hidden_note}
          className="mt-8"
        />
      )}
      <div className="pt-8">
        <SaasForm
          // A new result mounts the form again, so it shows the product as it is now saved.
          key={result?.at ?? "saved"}
          id={id}
          saas={saas.data}
          settings={settings.data}
          connection={connection.data as RevenueConnection | null}
          snapshot={connection.data ? snapshot.data : null}
          oauthReady={oauthReadyProviders()}
          result={result}
        />
        <DomainVerification
          saasId={id}
          domain={domain}
          record={
            domain && token
              ? { name: recordName(domain), label: RECORD_LABEL, value: recordValue(token) }
              : null
          }
          verifiedDomain={currentVerifiedDomain(saas.data.website, saas.data.verified_domain)}
          verifiedAt={saas.data.domain_verified_at}
          missingSince={verification.data?.missing_since ?? null}
        />
        {/* A hidden product has no public page, so it has no badge either. */}
        {!saas.data.hidden_at && (
          <BadgeEmbed
            path={`/saas/${saas.data.slug}`}
            pageUrl={`${siteUrl()}/saas/${saas.data.slug}`}
            name={saas.data.name}
          />
        )}
      </div>
      <DeleteProduct saasId={id} name={saas.data.name} connected={!!connection.data} />
    </Shell>
  );
}
