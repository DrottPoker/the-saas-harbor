import { notFound } from "next/navigation";
import { z } from "zod";
import { SaasForm } from "@/components/forms";
import { BackLink } from "@/components/back-link";
import { PageHeader, Shell } from "@/components/shell";
import { requireUser } from "@/lib/supabase/server";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: (await params).id === "new" ? "Add a SaaS" : "Edit SaaS" };
}
export default async function EditSaas({ params }: { params: Promise<{ id: string }> }) {
  const { user, client } = await requireUser();
  const { id } = await params;
  const isNew = id === "new";
  if (!isNew && !z.uuid().safeParse(id).success) notFound();
  let saas;
  let report;
  if (!isNew) {
    const { data, error } = await client
      .from("saas")
      .select("*")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (error) throw new Error("Your SaaS could not be loaded.");
    if (!data) notFound();
    saas = data;
    const result = await client
      .from("metric_reports")
      .select("*")
      .eq("saas_id", id)
      .eq("owner_id", user.id)
      .order("reported_at", { ascending: false })
      .order("id")
      .limit(1)
      .maybeSingle();
    if (result.error) throw new Error("Your private metrics could not be loaded.");
    report = result.data;
  }
  return (
    <Shell size="medium">
      <BackLink href="/dashboard">Dashboard</BackLink>
      <PageHeader
        className="mt-4 border-b"
        title={isNew ? "Add a SaaS" : `Edit ${saas?.name}`}
        description="Product details are public. Metrics stay private unless you share them."
      />
      <div className="pt-8">
        <SaasForm id={isNew ? crypto.randomUUID() : id} saas={saas} report={report} />
      </div>
    </Shell>
  );
}
