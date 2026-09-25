import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DecisionForm, ReversalForm } from "@/components/admin/decision-forms";
import { DoneNotice } from "@/components/admin/done-notice";
import { Facts, Panel } from "@/components/admin/panel";
import { LogList, ReportList } from "@/components/admin/rows";
import { ProductLogo } from "@/components/avatars";
import { Badge } from "@/components/badge";
import { BackLink } from "@/components/back-link";
import { Notice } from "@/components/shell";
import { profileNames, requireAdmin } from "@/lib/admin";
import { formatDate, formatUsd } from "@/lib/domain";
import { decisionLabels, isReason } from "@/lib/moderation";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export const metadata = { title: "Product" };

const link = "font-medium underline underline-offset-2";

function revenue(listing: { revenue_status: string | null; mrr_cents: number | null } | null) {
  if (listing?.revenue_status === "verified" && listing.mrr_cents != null)
    return `${formatUsd(listing.mrr_cents)} MRR, verified and shared`;
  if (listing?.revenue_status === "private") return "Verified, kept private";
  if (listing?.revenue_status === "stale") return "Verification out of date";
  return "Not verified";
}

export default async function AdminProduct({ params, searchParams }: Props) {
  const { client } = await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [product, listing, reports, log] = await Promise.all([
    client
      .from("saas")
      .select("*, owner:profiles(id, name, suspended_at)")
      .eq("id", id)
      .maybeSingle(),
    // Admins read the public projection of every product, hidden ones included.
    client.from("public_saas").select("revenue_status, mrr_cents").eq("id", id).maybeSingle(),
    client
      .from("reports")
      .select("id, target, content, reason, status, created_at, subject_id")
      .eq("saas_id", id)
      .order("created_at", { ascending: false }),
    client
      .from("moderation_log")
      .select("*")
      .eq("saas_id", id)
      .order("created_at", { ascending: false }),
  ]);
  for (const result of [product, listing, reports, log])
    if (result.error) throw new Error("This product could not be loaded.");
  const item = product.data;
  if (!item) notFound();
  const names = await profileNames(client, [
    item.owner_id,
    ...(log.data ?? []).map((entry) => entry.admin_id),
  ]);
  const ownerSuspended = !!item.owner?.suspended_at;
  const returnTo = `/admin/products/${id}`;

  return (
    <>
      <BackLink href="/admin/products">Products</BackLink>
      <div className="mt-4 flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-start">
        <ProductLogo path={item.logo_path} name={item.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">
            {item.name}
          </h1>
          <p className="mt-1 text-muted-foreground">{item.tagline}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            by{" "}
            <Link className={link} href={`/admin/accounts/${item.owner_id}`}>
              {item.owner?.name ?? "Unknown maker"}
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {item.hidden_at && <Badge tone="error">Hidden</Badge>}
          {ownerSuspended && <Badge tone="error">Maker suspended</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
        <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-6">
          <DoneNotice done={(await searchParams).done} />
          <Panel id="details" title="Details">
            <Facts
              rows={[
                ["Category", item.category],
                ["Website", item.website],
                ["Listed", formatDate(item.created_at)],
                ["Revenue", revenue(listing.data)],
                [
                  "Public page",
                  !item.hidden_at && !ownerSuspended ? (
                    <Link className={link} href={`/saas/${item.slug}`}>
                      Open
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Not shown</span>
                  ),
                ],
              ]}
            />
            <p className="mt-4 border-t pt-4 text-sm leading-6 whitespace-pre-wrap text-foreground/85 [overflow-wrap:anywhere]">
              {item.description}
            </p>
          </Panel>

          <section aria-labelledby="reports">
            <h2 id="reports" className="mb-4 font-semibold">
              Reports about this product
            </h2>
            {reports.data?.length ? (
              <ReportList
                reports={reports.data}
                names={names}
                label="Reports about this product"
                showMaker={false}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No reports.</p>
            )}
          </section>

          <section aria-labelledby="history">
            <h2 id="history" className="mb-4 font-semibold">
              History
            </h2>
            {log.data?.length ? (
              <LogList entries={log.data} admins={names} label="History" />
            ) : (
              <p className="text-sm text-muted-foreground">No decisions yet.</p>
            )}
          </section>
        </div>

        <aside className="grid grid-cols-[minmax(0,1fr)] content-start gap-6">
          {item.hidden_at ? (
            <Panel
              id="hidden"
              title="Hidden"
              description="The owner sees this reason and explanation in their dashboard."
            >
              <Facts
                rows={[
                  ["Since", formatDate(item.hidden_at)],
                  [
                    "Reason",
                    isReason(item.hidden_reason) ? decisionLabels[item.hidden_reason] : "Not given",
                  ],
                  ["Explanation", <span className="whitespace-pre-wrap">{item.hidden_note}</span>],
                ]}
              />
              <div className="mt-5 border-t pt-5">
                <ReversalForm kind="saas" targetId={id} returnTo={returnTo} />
              </div>
            </Panel>
          ) : (
            <Panel
              id="hide"
              title="Hide the product"
              description="It disappears from the site. The owner sees the reason and your explanation."
            >
              <DecisionForm kind="hide" targetId={id} returnTo={returnTo} />
            </Panel>
          )}
          {ownerSuspended && (
            <Notice>
              The maker&apos;s account is suspended, so none of their products are shown.{" "}
              <Link className={link} href={`/admin/accounts/${item.owner_id}`}>
                Account
              </Link>
            </Notice>
          )}
        </aside>
      </div>
    </>
  );
}
