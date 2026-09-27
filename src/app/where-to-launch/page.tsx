import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/domain";
import {
  GUIDE_CHECKED,
  GUIDE_PUBLISHED,
  launchCautions,
  launchGroups,
  launchOrder,
  SPAM_POLICIES_URL,
  type LaunchPlace,
} from "@/lib/launch-guide";
import { pageMetadata } from "@/lib/seo";
import { guideJsonLd } from "@/lib/structured-data";

const title = "Where to launch your SaaS";
const description =
  "Where to list and launch a new SaaS: launch days, communities, directories and review sites, with what each is good for and what it asks of you.";

export const metadata = pageMetadata({ title, description, path: "/where-to-launch" });

function Place({ place }: { place: LaunchPlace }) {
  const facts = [
    ["How it works", place.how],
    ["Cost", place.cost],
    ["Best for", place.bestFor],
    ...(place.tip ? [["Tip", place.tip]] : []),
  ];
  return (
    <article
      aria-labelledby={`place-${place.id}`}
      className="rounded-xl border bg-surface p-5 leading-7 shadow-card"
    >
      <h3 id={`place-${place.id}`} className="font-semibold">
        {place.internal ? (
          <Link href={place.url} className="hover:underline">
            {place.name}
          </Link>
        ) : (
          <a
            href={place.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 hover:underline"
          >
            {place.name}
            <ArrowUpRight aria-hidden="true" className="size-4 text-muted-foreground" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </h3>
      <p className="mt-1 text-foreground/85">{place.summary}</p>
      <dl className="mt-4 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
        {facts.map(([label, text]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="max-sm:mb-1">{text}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

// A guide to launching a new SaaS, with The SaaS Harbor as one place among others. What it says
// about other sites was checked on GUIDE_CHECKED and links to their own rules.
export default function WhereToLaunch() {
  return (
    <Shell size="narrow">
      <JsonLd
        data={guideJsonLd({
          path: "/where-to-launch",
          headline: title,
          description,
          published: GUIDE_PUBLISHED,
          modified: GUIDE_CHECKED,
          places: launchGroups.flatMap((group) => group.places),
        })}
      />
      <PageHeader title={title} description={description} />
      <p className="text-sm text-muted-foreground">
        Checked {formatDate(GUIDE_CHECKED)}. Rules, queues and prices change, so read each
        site&apos;s own terms before you submit.
      </p>
      <div className="mt-10 grid gap-12 border-t pt-10">
        <section aria-labelledby="order">
          <h2 id="order" className="text-lg font-semibold">
            An order that works
          </h2>
          <ol className="mt-3 grid list-decimal gap-2 pl-5 leading-7 text-foreground/85 marker:text-faint-foreground">
            {launchOrder.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
        {launchGroups.map((group) => (
          <section key={group.id} aria-labelledby={group.id}>
            <h2 id={group.id} className="text-lg font-semibold">
              {group.title}
            </h2>
            <p className="mt-2 leading-7 text-foreground/85">{group.intro}</p>
            <div className="mt-5 grid gap-4">
              {group.places.map((place) => (
                <Place key={place.id} place={place} />
              ))}
            </div>
          </section>
        ))}
        <section aria-labelledby="cautions">
          <h2 id="cautions" className="text-lg font-semibold">
            What to watch out for
          </h2>
          <ul className="mt-3 grid list-disc gap-2 pl-5 leading-7 text-foreground/85 marker:text-faint-foreground">
            {launchCautions.map((caution) => (
              <li key={caution}>{caution}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            Source:{" "}
            <a
              href={SPAM_POLICIES_URL}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="font-medium text-foreground underline"
            >
              Google Search spam policies
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        </section>
        <div className="grid gap-3">
          <p className="leading-7 text-foreground/85">
            The SaaS Harbor lists any SaaS for free, new or established, and ranks the ones that
            verify their revenue.
          </p>
          <div>
            <Button asChild>
              <Link href="/list-your-saas">List your SaaS</Link>
            </Button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
