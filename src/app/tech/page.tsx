import Link from "next/link";
import { categoryChip } from "@/components/explore";
import { JsonLd } from "@/components/json-ld";
import { PageHeader, Shell } from "@/components/shell";
import { techCounts } from "@/lib/data";
import { pageMetadata } from "@/lib/seo";
import { techsJsonLd } from "@/lib/structured-data";
import { techGroups, technologies } from "@/lib/tech";

const description =
  "Independent SaaS products by the technologies they are built with, as their founders list them, each ranked by monthly recurring revenue verified through the product's payment provider.";

export const metadata = pageMetadata({ title: "Tech stacks", description, path: "/tech" });

export default async function TechStacks() {
  const counts = await techCounts();
  return (
    <Shell>
      <JsonLd data={techsJsonLd(technologies)} />
      <PageHeader title="Tech stacks" description={description} />
      <div className="grid gap-10">
        {techGroups.map((group) => (
          <section key={group} aria-labelledby={`group-${group}`}>
            <h2 id={`group-${group}`} className="mb-3 font-semibold">
              {group}
            </h2>
            <ul className="flex flex-wrap gap-1.5">
              {technologies
                .filter((tech) => tech.group === group)
                .map((tech) => {
                  const products = counts.get(tech.slug)?.products ?? 0;
                  return (
                    <li key={tech.slug}>
                      <Link href={`/tech/${tech.slug}`} className={categoryChip}>
                        {tech.name}
                        {!!products && (
                          <span className="ml-1.5 text-faint-foreground tabular-nums">
                            {products}
                            <span className="sr-only">
                              {products === 1 ? " product" : " products"}
                            </span>
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>
    </Shell>
  );
}
