import Link from "next/link";
import { groupTechStack } from "@/lib/tech";
import { categoryChip } from "./explore";

/** A product's tech stack by group, each technology linking to its page. */
export function TechStack({ stack }: { stack: readonly string[] | null | undefined }) {
  const groups = groupTechStack(stack);
  if (!groups.length) return null;
  return (
    <section aria-labelledby="tech-stack">
      <h2 id="tech-stack" className="text-lg font-semibold">
        Tech stack
      </h2>
      <dl className="mt-4 grid gap-4">
        {groups.map(({ group, items }) => (
          <div key={group} className="grid gap-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
            <dt className="text-sm text-muted-foreground sm:pt-1">{group}</dt>
            <dd className="flex flex-wrap gap-1.5">
              {items.map((tech) => (
                <Link key={tech.slug} href={`/tech/${tech.slug}`} className={categoryChip}>
                  {tech.name}
                </Link>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
