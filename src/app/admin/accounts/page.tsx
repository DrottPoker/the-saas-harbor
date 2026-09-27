import { EmailAccounts } from "@/components/admin/email-accounts";
import { FilterTabs, SearchForm } from "@/components/admin/filters";
import { AccountList } from "@/components/admin/rows";
import { BackLink } from "@/components/back-link";
import { ResultsFooter } from "@/components/listings";
import { EmptyState, PageHeader } from "@/components/shell";
import { ADMIN_PAGE_SIZE, requireAdmin } from "@/lib/admin";
import {
  FUNNEL_STEPS,
  RANGE_VALUES,
  isTimeZone,
  rangeLabel,
  type FunnelStep,
  type Range,
} from "@/lib/analytics-reports";
import { PAST_LAST_PAGE } from "@/lib/data";
import { firstValues, safePage, type SearchParams } from "@/lib/params";

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

// The accounts of a funnel period whose last step is `step`, from the Analytics page's Funnel.
type Stopped = { step: FunnelStep; range: Range; tz: string };
function stoppedParams(params: Record<string, string | undefined>): Stopped | null {
  const { stopped: step, range, tz } = params;
  if (!step || !Object.hasOwn(FUNNEL_STEPS, step)) return null;
  if (!range || !(RANGE_VALUES as string[]).includes(range)) return null;
  if (!tz || !isTimeZone(tz)) return null;
  return { step: step as FunnelStep, range: range as Range, tz };
}

export default async function AdminAccounts({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { client } = await requireAdmin();
  const params = firstValues(await searchParams);
  const stopped = stoppedParams(params);
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
  const stoppedUrl = (nextPage: number) => {
    const { step, range, tz } = stopped!;
    const query = new URLSearchParams({ stopped: step, range, tz });
    if (nextPage > 1) query.set("page", String(nextPage));
    return `/admin/accounts?${query}`;
  };
  const start = (page - 1) * ADMIN_PAGE_SIZE;
  const stoppedArgs = stopped && {
    p_range: stopped.range,
    p_tz: stopped.tz,
    p_step: stopped.step,
  };
  const [listed, addresses] = await Promise.all([
    (stoppedArgs
      ? client.rpc("admin_funnel_accounts", stoppedArgs, { count: "exact" })
      : client.rpc("admin_accounts", { p_search: search, p_filter: filter }, { count: "exact" })
    ).range(start, start + ADMIN_PAGE_SIZE - 1),
    // Every address of the list, not only this page's, for writing to them all.
    stoppedArgs
      ? client.rpc("admin_funnel_accounts", stoppedArgs).select("email").limit(1000)
      : null,
  ]);
  if (listed.error && listed.error.code !== PAST_LAST_PAGE)
    throw new Error("Accounts could not be loaded.");
  if (addresses?.error) throw new Error("Accounts could not be loaded.");
  const accounts = listed.data ?? [];
  const count = listed.count ?? 0;

  if (stopped) {
    const step = FUNNEL_STEPS[stopped.step];
    const created =
      stopped.range === "all"
        ? "Accounts created at any time"
        : `Accounts created in the ${rangeLabel(stopped.range).toLowerCase()}`;
    return (
      <>
        <BackLink href="/admin/analytics">Analytics</BackLink>
        <PageHeader
          className="mt-4"
          title={`Stopped at ${step}`}
          description={
            stopped.step === "ranked"
              ? `${created} that went all the way to the leaderboard. Newest first.`
              : `${created} whose last step in the funnel is ${step}. Newest first.`
          }
          actions={<EmailAccounts emails={(addresses?.data ?? []).map((row) => row.email)} />}
        />
        {!accounts.length ? (
          <EmptyState title="No accounts stopped here">
            The funnel may have moved on since the Analytics page was loaded.
          </EmptyState>
        ) : (
          <>
            <AccountList accounts={accounts} />
            <ResultsFooter
              page={page}
              count={count}
              href={stoppedUrl}
              pageSize={ADMIN_PAGE_SIZE}
              noun={["account", "accounts"]}
            />
          </>
        )}
      </>
    );
  }

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
            count={count}
            href={(next) => url(filter, next)}
            pageSize={ADMIN_PAGE_SIZE}
            noun={["account", "accounts"]}
          />
        </>
      )}
    </>
  );
}
