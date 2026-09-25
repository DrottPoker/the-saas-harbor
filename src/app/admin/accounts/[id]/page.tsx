import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DecisionForm, ReversalForm } from "@/components/admin/decision-forms";
import { DoneNotice } from "@/components/admin/done-notice";
import { Facts, Panel } from "@/components/admin/panel";
import { LogList, ProductList, ReportList } from "@/components/admin/rows";
import { PersonAvatar } from "@/components/avatars";
import { Badge } from "@/components/badge";
import { BackLink } from "@/components/back-link";
import { Notice } from "@/components/shell";
import { openReportCounts, profileNames, requireAdmin } from "@/lib/admin";
import { formatDate } from "@/lib/domain";
import { decisionLabels, isReason } from "@/lib/moderation";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export const metadata = { title: "Account" };

const link = "font-medium underline underline-offset-2";
const date = (value: string | null) => (value ? formatDate(value) : "Never");

export default async function AdminAccount({ params, searchParams }: Props) {
  const { user, client } = await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [account, profile, products, reports, sent, log] = await Promise.all([
    client.rpc("admin_account", { p_id: id }).maybeSingle(),
    client.from("profiles").select("*").eq("id", id).maybeSingle(),
    client
      .from("saas")
      .select("id, name, tagline, logo_path, created_at, hidden_at")
      .eq("owner_id", id)
      .order("created_at", { ascending: false }),
    client
      .from("reports")
      .select("id, target, content, reason, status, created_at, subject_id")
      .eq("subject_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    client.from("reports").select("id", { count: "exact", head: true }).eq("reporter_id", id),
    client
      .from("moderation_log")
      .select("*")
      .eq("subject_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  for (const result of [account, profile, products, reports, sent, log])
    if (result.error) throw new Error("This account could not be loaded.");
  if (!account.data) notFound();
  const maker = profile.data;
  const [admins, productReports] = await Promise.all([
    profileNames(client, [id, ...(log.data ?? []).map((entry) => entry.admin_id)]),
    openReportCounts(
      client,
      "saas_id",
      (products.data ?? []).map((product) => product.id),
    ),
  ]);
  const owner = maker && { name: maker.name, suspended_at: maker.suspended_at };
  const returnTo = `/admin/accounts/${id}`;
  const own = id === user.id;

  return (
    <>
      <BackLink href="/admin/accounts">Accounts</BackLink>
      <div className="mt-4 flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-start">
        <PersonAvatar
          path={maker?.avatar_path}
          name={maker?.name ?? account.data.email}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">
            {maker?.name ?? "No maker profile"}
          </h1>
          {maker?.headline && <p className="mt-1 text-muted-foreground">{maker.headline}</p>}
          <p className="mt-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {account.data.email}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {maker?.suspended_at && <Badge tone="error">Suspended</Badge>}
          {account.data.is_admin && <Badge>Admin</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
        <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-6">
          <DoneNotice done={(await searchParams).done} />
          <Panel id="details" title="Account">
            <Facts
              rows={[
                ["Email", account.data.email],
                ["Joined", date(account.data.created_at)],
                ["Last sign-in", date(account.data.last_sign_in_at)],
                ["Email confirmed", account.data.email_confirmed_at ? "Yes" : "No"],
                ["Reports sent", String(sent.count ?? 0)],
                [
                  "Public profile",
                  maker && !maker.suspended_at ? (
                    <Link className={link} href={`/makers/${maker.slug}`}>
                      Open
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Not shown</span>
                  ),
                ],
              ]}
            />
          </Panel>

          <section aria-labelledby="products">
            <h2 id="products" className="mb-4 font-semibold">
              Products
            </h2>
            {products.data?.length ? (
              <ProductList
                products={products.data.map((product) => ({ ...product, owner }))}
                openReports={productReports}
                showMaker={false}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No products.</p>
            )}
          </section>

          <section aria-labelledby="reports">
            <h2 id="reports" className="mb-4 font-semibold">
              Reports about this maker
            </h2>
            {reports.data?.length ? (
              <ReportList
                reports={reports.data}
                names={admins}
                label="Reports about this maker"
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
              <LogList entries={log.data} admins={admins} label="History" />
            ) : (
              <p className="text-sm text-muted-foreground">No decisions yet.</p>
            )}
          </section>
        </div>

        <aside className="grid grid-cols-[minmax(0,1fr)] content-start gap-6">
          {maker?.suspended_at ? (
            <Panel
              id="suspended"
              title="Suspended"
              description="The maker sees this reason and explanation in their dashboard."
            >
              <Facts
                rows={[
                  ["Since", formatDate(maker.suspended_at)],
                  [
                    "Reason",
                    isReason(maker.suspended_reason)
                      ? decisionLabels[maker.suspended_reason]
                      : "Not given",
                  ],
                  [
                    "Explanation",
                    <span className="whitespace-pre-wrap">{maker.suspended_note}</span>,
                  ],
                ]}
              />
              <div className="mt-5 border-t pt-5">
                <ReversalForm kind="account" targetId={id} returnTo={returnTo} />
              </div>
            </Panel>
          ) : !maker ? (
            <Notice>This account has no maker profile, so nothing of it is public.</Notice>
          ) : own ? (
            <Notice>This is your own account.</Notice>
          ) : account.data.is_admin ? (
            <Notice>
              Admins cannot be suspended. Remove the admin rights first, as the README describes.
            </Notice>
          ) : (
            <Panel
              id="suspend"
              title="Suspend the account"
              description="The profile and products disappear, and the maker cannot send messages or reports. This closes every open report about them."
            >
              <DecisionForm kind="suspend" targetId={id} returnTo={returnTo} />
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}
