import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SaasForm } from "@/components/forms";
import { requireUser } from "@/lib/supabase/server";
export const metadata = { title: "Edit SaaS" };
export default async function EditSaas({ params }: { params: Promise<{ id: string }> }) {
  const { user, client } = await requireUser();
  const { id } = await params;
  const isNew = id === "new";
  if (!isNew && !z.uuid().safeParse(id).success) notFound();
  let saas;
  let report;
  if (!isNew) {
    const { data, error } = await client.from("saas").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
    if (error) throw new Error("Your SaaS could not be loaded.");
    if (!data) notFound();
    saas = data;
    const result = await client.from("metric_reports").select("*").eq("saas_id", id).eq("owner_id", user.id).order("reported_at", { ascending: false }).order("id").limit(1).maybeSingle();
    if (result.error) throw new Error("Your private metrics could not be loaded.");
    report = result.data;
  }
  return <div className="editor-shell"><Link className="back-link" href="/dashboard">← My harbor</Link><p className="eyebrow">{isNew ? "READY TO DROP ANCHOR?" : "KEEP YOUR STORY UP TO DATE"}</p><h1>{isNew ? "Bring your SaaS aboard." : `Edit ${saas?.name}.`}</h1><p className="muted editor-description">Share your product with the world. Choose which numbers to share.</p><div className="editor-card"><SaasForm id={isNew ? crypto.randomUUID() : id} saas={saas} report={report}/></div></div>;
}
