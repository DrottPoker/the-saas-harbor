import { FilterTabs, SearchForm } from "@/components/admin/filters";
import { AccountList } from "@/components/admin/rows";
import { ResultsFooter } from "@/components/listings";
import { EmptyState, PageHeader } from "@/components/shell";
import { ADMIN_PAGE_SIZE, requireAdmin } from "@/lib/admin";
import { PAST_LAST_PAGE, safePage } from "@/lib/data";
import { firstValues, type SearchParams } from "@/lib/params";

export const metadata = { title: "Accounts" };

const filters = [
  ["all", "All"],
  ["reported", "With open reports"],
  ["suspended", "Suspended"],
  ["admins", "Admins"],
] as const;
type Filter = (typeof filters)[number][0];
const isFilter = (value: string | undefined): value is Filter =>
  filters.some(([filter]) => filter === value);

export default async function AdminAccounts({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { client } = await requireAdmin();
  const params = firstValues(await searchParams);
  const filter: Filter = isFilter(params.filter) ? params.filter : "all";
  const search = (params.q ?? "").trim().slice(0, 80);
  const page = safePage(params.page);
  const url = (next: Filter, nextPage = 1) => {
    const query = new URLSearchParams();
    if (next !== "all") query.set("filter", next);
    if (search) query.set("q", search);
    if (nextPage > 1) query.set("page", String(nextPage));
    return `/admin/accounts${query.size ? `?${query}` : ""}`;
  };
  const start = (page - 1) * ADMIN_PAGE_SIZE;
  const {
    data: accountRows,
    count,
    error,
  } = await client
    .rpc("admin_accounts", { p_search: search, p_filter: filter }, { count: "exact" })
    .range(start, start + ADMIN_PAGE_SIZE - 1);
  if (error && error.code !== PAST_LAST_PAGE) throw new Error("Accounts could not be loaded.");
  const accounts = accountRows ?? [];

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Every account, newest first, including those without a profile."
        actions={
          <SearchForm
            action="/admin/accounts"
            label="Search accounts by name or email"
            placeholder="Name or email"
            value={search}
            hidden={filter === "all" ? {} : { filter }}
          />
        }
      />
      <div className="mb-4">
        <FilterTabs
          label="Account filter"
          current={filter}
          options={filters.map(([value, label]) => ({ value, label, href: url(value) }))}
        />
      </div>
      {!accounts.length ? (
        <EmptyState title="No matching accounts">Try another filter or search term.</EmptyState>
      ) : (
        <>
          <AccountList accounts={accounts} />
          <ResultsFooter
            page={page}
            count={count ?? 0}
            href={(next) => url(filter, next)}
            pageSize={ADMIN_PAGE_SIZE}
            noun={["account", "accounts"]}
          />
        </>
      )}
    </>
  );
}
