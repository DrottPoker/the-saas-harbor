import Link from "next/link";
import { Badge } from "@/components/badge";
import { BackLink } from "@/components/back-link";
import { Contact } from "@/components/legal";
import { EmptyState, Notice, PageHeader, Shell } from "@/components/shell";
import { formatDate } from "@/lib/domain";
import {
  isReason,
  isReportStatus,
  reasonLabels,
  reportTitle,
  statusLabels,
  statusTones,
  targetLabels,
  type ReportTarget,
} from "@/lib/moderation";
import { requireUser } from "@/lib/supabase/server";
import { firstValues, type SearchParams } from "@/lib/params";

export const metadata = { title: "Your reports" };

export default async function YourReports({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user, client } = await requireUser();
  const { data: reports, error } = await client
    .from("reports")
    .select("id, target, reason, content, status, created_at, resolved_at")
    .eq("reporter_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("Your reports could not be loaded.");

  return (
    <Shell size="medium">
      <BackLink href="/dashboard">Dashboard</BackLink>
      <PageHeader
        className="mt-4"
        title="Your reports"
        description="Reports you sent about products, profiles and messages, and what happened to them."
      />
      {firstValues(await searchParams).sent && (
        <Notice tone="success" className="mb-6">
          Thanks. Your report was sent, and an admin will review it.
        </Notice>
      )}
      {!reports.length ? (
        <EmptyState title="No reports yet">
          To report a product, a profile or a message you received, choose Report next to it.
        </EmptyState>
      ) : (
        <ul aria-label="Reports you sent" className="divide-y rounded-xl border bg-surface">
          {reports.map((report) => {
            const status = isReportStatus(report.status) ? report.status : "open";
            return (
              <li
                key={report.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    <span className="text-muted-foreground">
                      {targetLabels[report.target as ReportTarget] ?? "Report"}:
                    </span>{" "}
                    {reportTitle(report)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isReason(report.reason) ? reasonLabels[report.reason] : report.reason} · Sent{" "}
                    {formatDate(report.created_at)}
                    {report.resolved_at && ` · Decided ${formatDate(report.resolved_at)}`}
                  </p>
                </div>
                <Badge tone={statusTones[status]} className="self-start sm:self-auto">
                  {statusLabels[status]}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-6 max-w-2xl text-[13px] text-muted-foreground">
        An admin reviews every report. The maker is not told who reported. If you disagree with a
        decision, write to <Contact className="font-medium text-foreground underline" />. The{" "}
        <Link href="/terms#moderation" className="font-medium text-foreground underline">
          terms
        </Link>{" "}
        explain how reports are handled.
      </p>
    </Shell>
  );
}
