import { FilterTabs } from "@/components/admin/filters";
import { ReportList } from "@/components/admin/rows";
import { ResultsFooter } from "@/components/listings";
import { EmptyState, PageHeader } from "@/components/shell";
import { ADMIN_PAGE_SIZE, profileNames, requireAdmin } from "@/lib/admin";
import { safePage } from "@/lib/data";

export const metadata = { title: "Reports" };

const filters = [
  ["open", "Open"],
  ["closed", "Closed"],
  ["all", "All"],
] as const;
type Filter = (typeof filters)[number][0];

export default async function AdminReports({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { client } = await requireAdmin();
  const params = await searchParams;
  const status: Filter =
    params.status === "closed" || params.status === "all" ? params.status : "open";
  const page = safePage(params.page);
  const url = (next: Filter, nextPage = 1) => {
    const query = new URLSearchParams();
    if (next !== "open") query.set("status", next);
    if (nextPage > 1) query.set("page", String(nextPage));
    return `/admin/reports${query.size ? `?${query}` : ""}`;
  };

  let query = client
    .from("reports")
    .select("id, target, content, reason, status, created_at, subject_id", { count: "exact" });
  // Open reports are a queue, oldest first. Closed ones show the latest decisions first.
  query =
    status === "open"
      ? query.eq("status", "open").order("created_at").order("id")
      : status === "closed"
        ? query.neq("status", "open").order("resolved_at", { ascending: false }).order("id")
        : query.order("created_at", { ascending: false }).order("id");
  const start = (page - 1) * ADMIN_PAGE_SIZE;
  const { data: reports, count, error } = await query.range(start, start + ADMIN_PAGE_SIZE - 1);
  if (error) throw new Error("Reports could not be loaded.");
  const names = await profileNames(
    client,
    reports.map((report) => report.subject_id),
  );

  return (
    <>
      <PageHeader
        title="Reports"
        description="Reports from makers about products, profiles and messages they received."
      />
      <div className="mb-4">
        <FilterTabs
          label="Report status"
          current={status}
          options={filters.map(([value, label]) => ({ value, label, href: url(value) }))}
        />
      </div>
      {!reports.length ? (
        <EmptyState title={status === "open" ? "No open reports" : "No reports"}>
          {status === "open"
            ? "Every report has been handled."
            : "Reports from makers are listed here."}
        </EmptyState>
      ) : (
        <>
          <ReportList reports={reports} names={names} />
          <ResultsFooter
            page={page}
            count={count ?? 0}
            href={(next) => url(status, next)}
            pageSize={ADMIN_PAGE_SIZE}
            noun={["report", "reports"]}
          />
        </>
      )}
    </>
  );
}
