import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DecisionForm, ReversalForm } from "@/components/admin/decision-forms";
import { DoneNotice } from "@/components/admin/done-notice";
import { Facts, Panel } from "@/components/admin/panel";
import { ReportedContent } from "@/components/admin/reported-content";
import { LogList, ReportList } from "@/components/admin/rows";
import { PersonAvatar } from "@/components/avatars";
import { Badge } from "@/components/badge";
import { BackLink } from "@/components/back-link";
import { Notice } from "@/components/shell";
import { profileNames, requireAdmin } from "@/lib/admin";
import { formatDate } from "@/lib/domain";
import {
  adminStatusLabels,
  isReason,
  isReportStatus,
  reasonLabels,
  reportTitle,
  statusTones,
  targetLabels,
  type ReportTarget,
} from "@/lib/moderation";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export const metadata = { title: "Report" };

const link = "font-medium underline underline-offset-2 hover:text-foreground";

export default async function AdminReport({ params, searchParams }: Props) {
  const { user, client } = await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { data: report, error } = await client
    .from("reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("This report could not be loaded.");
  if (!report) notFound();

  // Other reports about the same product, profile or message.
  let others = client
    .from("reports")
    .select("id, target, content, reason, status, created_at, subject_id")
    .neq("id", id)
    .order("created_at", { ascending: false })
    .limit(20);
  others = report.saas_id
    ? others.eq("saas_id", report.saas_id)
    : report.message_id
      ? others.eq("message_id", report.message_id)
      : others.eq("target", report.target).eq("subject_id", report.subject_id);
  const [subject, subjectAccount, reporterAccount, product, related, log] = await Promise.all([
    client
      .from("profiles")
      .select("id, name, headline, avatar_path, suspended_at")
      .eq("id", report.subject_id)
      .maybeSingle(),
    client.rpc("admin_account", { p_id: report.subject_id }).maybeSingle(),
    client.rpc("admin_account", { p_id: report.reporter_id }).maybeSingle(),
    report.saas_id
      ? client.from("saas").select("id, name, hidden_at").eq("id", report.saas_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    report.target === "saas" && !report.saas_id
      ? Promise.resolve({ data: [], error: null })
      : others,
    client.from("moderation_log").select("*").eq("report_id", id).order("created_at"),
  ]);
  for (const result of [subject, subjectAccount, reporterAccount, product, related, log])
    if (result.error) throw new Error("This report could not be loaded.");
  const names = await profileNames(client, [
    report.reporter_id,
    report.subject_id,
    ...(log.data ?? []).map((entry) => entry.admin_id),
    ...(related.data ?? []).map((other) => other.subject_id),
  ]);

  const target = report.target as ReportTarget;
  const status = isReportStatus(report.status) ? report.status : "open";
  const maker = subject.data;
  const makerName = maker?.name ?? "the maker";
  const returnTo = `/admin/reports/${id}`;
  const heading =
    target === "message"
      ? `Report about a message from ${makerName}`
      : `Report about ${target === "saas" ? reportTitle(report) : makerName}`;
  const productVisible = product.data && !product.data.hidden_at && maker && !maker.suspended_at;
  const canHide = status === "open" && product.data && !product.data.hidden_at;
  const canSuspend =
    status === "open" &&
    maker &&
    !maker.suspended_at &&
    !subjectAccount.data?.is_admin &&
    maker.id !== user.id;

  return (
    <>
      <BackLink href="/admin/reports">Reports</BackLink>
      <div className="mt-4 flex flex-col gap-3 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">
            {heading}
          </h1>
          <p className="mt-1.5 text-muted-foreground">
            {isReason(report.reason) ? reasonLabels[report.reason] : report.reason} · Sent{" "}
            {formatDate(report.created_at)}
          </p>
        </div>
        <Badge tone={statusTones[status]} className="self-start">
          {adminStatusLabels[status]}
        </Badge>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
        <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-6">
          <DoneNotice done={(await searchParams).done} />
          <Panel
            id="content"
            title={`Reported ${targetLabels[target].toLowerCase()}`}
            description="The copy saved when the report was sent. Links are shown as text."
          >
            <ReportedContent target={target} content={report.content} />
            {(target === "saas" || (target === "message" && !report.message_id)) && (
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t pt-4 text-sm text-muted-foreground">
                {report.saas_id ? (
                  <Link className={link} href={`/admin/products/${report.saas_id}`}>
                    Product in admin
                  </Link>
                ) : (
                  target === "saas" && <span>The product has since been deleted.</span>
                )}
                {productVisible && (
                  <Link className={link} href={`/saas/${report.saas_id}`}>
                    Public product page
                  </Link>
                )}
                {target === "message" && <span>The conversation has since been deleted.</span>}
              </div>
            )}
          </Panel>

          <Panel id="report" title="Report">
            <Facts
              rows={[
                ["Reason", isReason(report.reason) ? reasonLabels[report.reason] : report.reason],
                [
                  "Details",
                  report.details ? (
                    <span className="whitespace-pre-wrap">{report.details}</span>
                  ) : (
                    <span className="text-muted-foreground">No details given</span>
                  ),
                ],
                [
                  "Reported by",
                  <>
                    <Link className={link} href={`/admin/accounts/${report.reporter_id}`}>
                      {names.get(report.reporter_id) ?? "Account without a profile"}
                    </Link>
                    {reporterAccount.data && (
                      <span className="text-muted-foreground"> · {reporterAccount.data.email}</span>
                    )}
                  </>,
                ],
                ["Sent", formatDate(report.created_at)],
              ]}
            />
          </Panel>

          <Panel id="maker" title="Maker">
            <div className="flex items-center gap-3">
              <PersonAvatar path={maker?.avatar_path} name={makerName} />
              <div className="min-w-0 flex-1">
                <Link className={link} href={`/admin/accounts/${report.subject_id}`}>
                  {makerName}
                </Link>
                <p className="truncate text-sm text-muted-foreground">
                  {subjectAccount.data?.email}
                </p>
              </div>
              {maker?.suspended_at && <Badge tone="error">Suspended</Badge>}
              {subjectAccount.data?.is_admin && <Badge>Admin</Badge>}
            </div>
          </Panel>

          {!!related.data?.length && (
            <section aria-labelledby="related">
              <h2 id="related" className="mb-4 font-semibold">
                Other reports about this {targetLabels[target].toLowerCase()}
              </h2>
              <ReportList reports={related.data} names={names} label="Other reports" />
            </section>
          )}
        </div>

        <aside className="grid grid-cols-[minmax(0,1fr)] content-start gap-6">
          {status === "open" ? (
            <>
              {canHide && (
                <Panel
                  id="hide"
                  title="Hide the product"
                  description="It disappears from the site. The owner sees the reason and your explanation."
                >
                  <DecisionForm
                    kind="hide"
                    targetId={report.saas_id!}
                    reportId={id}
                    returnTo={returnTo}
                    defaultReason={report.reason}
                  />
                </Panel>
              )}
              {product.data?.hidden_at && <Notice>The product is already hidden.</Notice>}
              {canSuspend && (
                <Panel
                  id="suspend"
                  title="Suspend the account"
                  description="The profile and products disappear, and the maker cannot send messages or reports. This closes every open report about them."
                >
                  <DecisionForm
                    kind="suspend"
                    targetId={report.subject_id}
                    reportId={id}
                    returnTo={returnTo}
                    defaultReason={report.reason}
                  />
                </Panel>
              )}
              {maker?.suspended_at && <Notice>The account is already suspended.</Notice>}
              {subjectAccount.data?.is_admin && (
                <Notice>This account is an admin, so it cannot be suspended here.</Notice>
              )}
              <Panel
                id="dismiss"
                title="Dismiss the report"
                description="Nothing breaks the terms or the law. The reporter sees that no action was taken."
              >
                <ReversalForm kind="report" targetId={id} returnTo={returnTo} />
              </Panel>
            </>
          ) : (
            <Panel
              id="outcome"
              title="Outcome"
              description={`${adminStatusLabels[status]} on ${formatDate(report.resolved_at)}.`}
            >
              {log.data?.length ? (
                <LogList entries={log.data} admins={names} label="Decisions on this report" />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Closed by a decision about the whole account or product.
                </p>
              )}
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}
