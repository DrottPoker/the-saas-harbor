import { LogList } from "@/components/admin/rows";
import { ResultsFooter } from "@/components/listings";
import { EmptyState, PageHeader } from "@/components/shell";
import { ADMIN_PAGE_SIZE, profileNames, requireAdmin } from "@/lib/admin";
import { PAST_LAST_PAGE } from "@/lib/data";
import { firstValues, safePage, type SearchParams } from "@/lib/params";

export const metadata = { title: "Log" };

export default async function AdminLog({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { client } = await requireAdmin();
  const page = safePage(firstValues(await searchParams).page);
  const start = (page - 1) * ADMIN_PAGE_SIZE;
  const {
    data: entryRows,
    count,
    error,
  } = await client
    .from("moderation_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id")
    .range(start, start + ADMIN_PAGE_SIZE - 1);
  if (error && error.code !== PAST_LAST_PAGE) throw new Error("The log could not be loaded.");
  const entries = entryRows ?? [];
  const admins = await profileNames(
    client,
    entries.map((entry) => entry.admin_id),
  );

  return (
    <>
      <PageHeader
        title="Log"
        description="Every admin decision, newest first. Entries are deleted with the account they concern."
      />
      {!entries.length ? (
        <EmptyState title="No decisions yet">
          Hidden products, suspensions and dismissed reports are listed here.
        </EmptyState>
      ) : (
        <>
          <LogList entries={entries} admins={admins} />
          <ResultsFooter
            page={page}
            count={count ?? 0}
            href={(next) => `/admin/log${next > 1 ? `?page=${next}` : ""}`}
            pageSize={ADMIN_PAGE_SIZE}
            noun={["decision", "decisions"]}
          />
        </>
      )}
    </>
  );
}
