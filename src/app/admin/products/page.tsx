import { FilterTabs, SearchForm } from "@/components/admin/filters";
import { ProductList, type AdminProduct } from "@/components/admin/rows";
import { ResultsFooter } from "@/components/listings";
import { EmptyState, PageHeader } from "@/components/shell";
import { ADMIN_PAGE_SIZE, openReportCounts, requireAdmin } from "@/lib/admin";
import { PAST_LAST_PAGE } from "@/lib/data";
import { containsPattern } from "@/lib/domain";
import { firstValues, safePage, type SearchParams } from "@/lib/params";

export const metadata = { title: "Products" };

const filters = [
  ["all", "All"],
  ["reported", "With open reports"],
  ["hidden", "Hidden"],
] as const;
type Filter = (typeof filters)[number][0];

export default async function AdminProducts({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { client } = await requireAdmin();
  const params = firstValues(await searchParams);
  const filter: Filter =
    params.filter === "hidden" || params.filter === "reported" ? params.filter : "all";
  const search = (params.q ?? "").slice(0, 80);
  const page = safePage(params.page);
  const url = (next: Filter, nextPage = 1) => {
    const query = new URLSearchParams();
    if (next !== "all") query.set("filter", next);
    if (search) query.set("q", search);
    if (nextPage > 1) query.set("page", String(nextPage));
    return `/admin/products${query.size ? `?${query}` : ""}`;
  };

  let ids: string[] | null = null;
  if (filter === "reported") {
    const { data, error } = await client
      .from("reports")
      .select("saas_id")
      .eq("status", "open")
      .not("saas_id", "is", null);
    if (error) throw new Error("Products could not be loaded.");
    ids = [...new Set(data.map((row) => row.saas_id!))];
  }
  let products: AdminProduct[] = [];
  let count = 0;
  if (!ids || ids.length) {
    let query = client
      .from("saas")
      .select(
        "id, name, tagline, logo_path, created_at, hidden_at, owner:profiles(name, suspended_at)",
        {
          count: "exact",
        },
      );
    if (filter === "hidden") query = query.not("hidden_at", "is", null);
    if (ids) query = query.in("id", ids);
    const pattern = containsPattern(search);
    if (pattern) query = query.ilike("name", pattern);
    const start = (page - 1) * ADMIN_PAGE_SIZE;
    const result = await query
      .order("created_at", { ascending: false })
      .order("id")
      .range(start, start + ADMIN_PAGE_SIZE - 1);
    if (result.error && result.error.code !== PAST_LAST_PAGE)
      throw new Error("Products could not be loaded.");
    products = result.data ?? [];
    count = result.count ?? 0;
  }
  const reports = await openReportCounts(
    client,
    "saas_id",
    products.map((product) => product.id),
  );

  return (
    <>
      <PageHeader
        title="Products"
        description="Every listed product, including hidden ones and those of suspended founders."
        actions={
          <SearchForm
            action="/admin/products"
            label="Search products by name"
            placeholder="Search products"
            value={search}
            hidden={filter === "all" ? {} : { filter }}
          />
        }
      />
      <div className="mb-4">
        <FilterTabs
          label="Product filter"
          current={filter}
          options={filters.map(([value, label]) => ({ value, label, href: url(value) }))}
        />
      </div>
      {!products.length ? (
        <EmptyState title="No matching products">Try another filter or search term.</EmptyState>
      ) : (
        <>
          <ProductList products={products} openReports={reports} />
          <ResultsFooter
            page={page}
            count={count}
            href={(next) => url(filter, next)}
            pageSize={ADMIN_PAGE_SIZE}
          />
        </>
      )}
    </>
  );
}
