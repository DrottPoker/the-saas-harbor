import { notFound } from "next/navigation";
import { z } from "zod";
import { SaasForm } from "@/components/forms";
import { BackLink } from "@/components/back-link";
import { DeleteProduct } from "@/components/delete-forms";
import { PageHeader, Shell } from "@/components/shell";
import { StripeConnectionSection } from "@/components/stripe-connection";
import { STRIPE_CONNECTION_COLUMNS, type StripeConnection } from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export async function generateMetadata({ params }: Pick<Props, "params">) {
  return { title: (await params).id === "new" ? "Add a SaaS" : "Edit SaaS" };
}

export default async function EditSaas({ params, searchParams }: Props) {
  const { user, client } = await requireUser();
  const { id } = await params;
  const isNew = id === "new";
  if (!isNew && !z.uuid().safeParse(id).success) notFound();
  if (isNew) {
    return (
      <Shell size="medium">
        <BackLink href="/dashboard">Dashboard</BackLink>
        <PageHeader
          className="mt-4 border-b"
          title="Add a SaaS"
          description="Product details are public. After saving, connect Stripe to verify revenue."
        />
        <div className="pt-8">
          <SaasForm id={crypto.randomUUID()} />
        </div>
      </Shell>
    );
  }

  const [saas, settings, connection, snapshot] = await Promise.all([
    client.from("saas").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle(),
    client.from("saas_settings").select("*").eq("saas_id", id).maybeSingle(),
    client
      .from("stripe_connections")
      .select(STRIPE_CONNECTION_COLUMNS)
      .eq("saas_id", id)
      .maybeSingle(),
    client
      .from("revenue_snapshots")
      .select("*")
      .eq("saas_id", id)
      .order("captured_at", { ascending: false })
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (saas.error || settings.error || connection.error || snapshot.error)
    throw new Error("Your SaaS could not be loaded.");
  if (!saas.data) notFound();
  return (
    <Shell size="medium">
      <BackLink href="/dashboard">Dashboard</BackLink>
      <PageHeader
        className="mt-4 border-b"
        title={`Edit ${saas.data.name}`}
        description="Product details are public. Verified figures stay private unless you share them."
      />
      <div className="pt-8">
        <SaasForm id={id} saas={saas.data} settings={settings.data} />
        <StripeConnectionSection
          saasId={id}
          connection={connection.data as StripeConnection | null}
          snapshot={connection.data ? snapshot.data : null}
          created={(await searchParams).created === "1"}
        />
      </div>
      <DeleteProduct saasId={id} name={saas.data.name} connected={!!connection.data} />
    </Shell>
  );
}
