import type { Metadata } from "next";
import Link from "@/components/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/badge";
import { Contact } from "@/components/legal";
import { LocalTime } from "@/components/local-time";
import { EmptyState, Notice, PageHeader, Shell } from "@/components/shell";
import { operator } from "@/lib/legal";
import {
  isReason,
  isReportStatus,
  isReportTarget,
  reportSubject,
  statusTones,
} from "@/lib/moderation";
import { requireUser } from "@/lib/supabase/server";
import { firstValues, type SearchParams } from "@/lib/params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports.list");
  return { title: t("title") };
}

export default async function YourReports({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user, client } = await requireUser();
  const [{ data: reports, error }, t, reasons] = await Promise.all([
    client
      .from("reports")
      .select("id, target, reason, content, status, created_at, resolved_at")
      .eq("reporter_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
    getTranslations("reports.list"),
    getTranslations("reports.reasons"),
  ]);
  if (error) throw new Error("Your reports could not be loaded.");

  // A short title from the copy stored with the report.
  const title = (report: { target: string; content: unknown }) => {
    const subject = reportSubject(report);
    if (report.target === "message")
      return subject === null ? t("aMessage") : t("quote", { text: subject });
    return subject ?? t("unnamed");
  };

  return (
    <Shell size="medium">
      <PageHeader title={t("title")} description={t("description")} />
      {firstValues(await searchParams).sent && (
        <Notice tone="success" className="mb-6">
          {t("sent")}
        </Notice>
      )}
      {!reports.length ? (
        <EmptyState title={t("emptyTitle")}>{t("emptyBody")}</EmptyState>
      ) : (
        <ul aria-label={t("label")} className="divide-y rounded-xl border bg-surface shadow-card">
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
                      {t("about", {
                        target: t(
                          `targets.${isReportTarget(report.target) ? report.target : "unknown"}`,
                        ),
                      })}
                    </span>{" "}
                    <span dir="auto">{title(report)}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isReason(report.reason) ? reasons(`${report.reason}.label`) : report.reason}
                    {" · "}
                    {t.rich("sentOn", {
                      date: () => <LocalTime format="date" value={report.created_at} />,
                    })}
                    {report.resolved_at && (
                      <>
                        {" · "}
                        {t.rich("decidedOn", {
                          date: () => <LocalTime format="date" value={report.resolved_at!} />,
                        })}
                      </>
                    )}
                  </p>
                </div>
                <Badge tone={statusTones[status]} className="self-start sm:self-auto">
                  {t(`statuses.${status}`)}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-6 max-w-2xl text-[13px] text-muted-foreground">
        {t("reviewed")}{" "}
        {operator.email && (
          <>
            {t.rich("disagree", {
              contact: () => <Contact className="font-medium text-foreground underline" />,
            })}{" "}
          </>
        )}
        {t.rich("terms", {
          link: (chunks) => (
            <Link href="/terms#moderation" className="font-medium text-foreground underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </Shell>
  );
}
