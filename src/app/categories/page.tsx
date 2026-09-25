import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { PageHeader, Shell } from "@/components/shell";
import { categoryCounts } from "@/lib/data";
import { categories, categorySlug } from "@/lib/domain";
import { pageMetadata } from "@/lib/seo";
import { categoriesJsonLd } from "@/lib/structured-data";

const description =
  "Independent SaaS products by category, each ranked by monthly recurring revenue verified through the product's payment provider.";

export const metadata = pageMetadata({ title: "Categories", description, path: "/categories" });

function countLabel(products: number, ranked: number) {
  if (!products) return "No products yet";
  const listed = `${products} ${products === 1 ? "product" : "products"}`;
  return ranked ? `${listed}, ${ranked} ranked` : listed;
}

export default async function Categories() {
  const counts = await categoryCounts();
  return (
    <Shell>
      <JsonLd data={categoriesJsonLd([...categories])} />
      <PageHeader title="Categories" description={description} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => {
          const count = counts.get(category) ?? { products: 0, ranked: 0 };
          return (
            <li key={category}>
              <Link
                href={`/categories/${categorySlug(category)}`}
                className="flex h-full flex-col gap-1 rounded-xl border bg-surface p-5 transition-colors hover:border-border-strong"
              >
                <span className="font-medium">{category}</span>
                <span className="text-sm text-muted-foreground">
                  {countLabel(count.products, count.ranked)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}
