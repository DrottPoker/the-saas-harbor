import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { groupTechStack } from "@/lib/tech";
import { categoryChip } from "./explore";

/**
 * A product's tech stack as a card that opens on demand: closed, one line names the technologies;
 * open, they are listed by group, each linking to its page. The links stay in the page while it is
 * closed, so crawlers read them.
 */
export function TechStack({ stack }: { stack: readonly string[] | null | undefined }) {
  const groups = groupTechStack(stack);
  if (!groups.length) return null;
  const names = groups.flatMap(({ items }) => items.map((tech) => tech.name));
  return (
    // Without a minimum width, the one-line list would widen the page column on phones.
    <section aria-labelledby="tech-stack" className="min-w-0">
      <details className="group rounded-xl border bg-surface shadow-card">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-5 py-4 transition-colors select-none group-open:rounded-b-none hover:bg-subtle [&::-webkit-details-marker]:hidden">
          <h2 id="tech-stack" className="shrink-0 font-semibold">
            Tech stack
          </h2>
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground group-open:invisible">
            {names.join(", ")}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>
        <dl className="grid gap-3 border-t px-5 py-4">
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
      </details>
    </section>
  );
}
