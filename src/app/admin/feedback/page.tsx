import { FeedbackList } from "@/components/admin/feedback-list";
import { FilterTabs } from "@/components/admin/filters";
import { ResultsFooter } from "@/components/listings";
import { EmptyState, PageHeader } from "@/components/shell";
import { ADMIN_PAGE_SIZE, profileNames, requireAdmin } from "@/lib/admin";
import { PAST_LAST_PAGE } from "@/lib/data";
import { firstValues, safePage, type SearchParams } from "@/lib/params";

export const metadata = { title: "Feedback" };

const filters = [
  ["new", "New"],
  ["handled", "Handled"],
  ["all", "All"],
] as const;
type Filter = (typeof filters)[number][0];

export default async function AdminFeedback({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { client } = await requireAdmin();
  const params = firstValues(await searchParams);
  const status: Filter =
    params.status === "handled" || params.status === "all" ? params.status : "new";
  const page = safePage(params.page);
  const url = (next: Filter, nextPage = 1) => {
    const query = new URLSearchParams();
    if (next !== "new") query.set("status", next);
    if (nextPage > 1) query.set("page", String(nextPage));
    return `/admin/feedback${query.size ? `?${query}` : ""}`;
  };

  let query = client
    .from("feedback")
    .select("id, kind, message, page, created_at, handled_at, user_id", { count: "exact" });
  // The newest first; handled feedback by when it was handled.
  query =
    status === "new"
      ? query.is("handled_at", null).order("created_at", { ascending: false }).order("id")
      : status === "handled"
        ? query.not("handled_at", "is", null).order("handled_at", { ascending: false }).order("id")
        : query.order("created_at", { ascending: false }).order("id");
  const start = (page - 1) * ADMIN_PAGE_SIZE;
  const { data, count, error } = await query.range(start, start + ADMIN_PAGE_SIZE - 1);
  if (error && error.code !== PAST_LAST_PAGE) throw new Error("Feedback could not be loaded.");
  const items = data ?? [];
  const names = await profileNames(
    client,
    items.map((item) => item.user_id),
  );

  return (
    <>
      <PageHeader
        title="Feedback"
        description="Bugs, errors, suggestions and other feedback from users."
      />
      <div className="mb-4">
        <FilterTabs
          label="Feedback status"
          current={status}
          options={filters.map(([value, label]) => ({ value, label, href: url(value) }))}
        />
      </div>
      {!items.length ? (
        <EmptyState title={status === "new" ? "No new feedback" : "No feedback"}>
          {status === "new"
            ? "Everything has been handled. New feedback from users appears here."
            : "Feedback from users is listed here."}
        </EmptyState>
      ) : (
        <>
          <FeedbackList items={items} names={names} />
          <ResultsFooter
            page={page}
            count={count ?? 0}
            href={(next) => url(status, next)}
            pageSize={ADMIN_PAGE_SIZE}
            noun={["message", "messages"]}
          />
        </>
      )}
    </>
  );
}
