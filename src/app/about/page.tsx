import Link from "next/link";
import { PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";

export const metadata = { title: "How it works" };

const sections = [
  {
    title: "The leaderboard",
    body: [
      "Products are ranked by the monthly recurring revenue (MRR) their makers choose to share publicly, in US dollars. Makers enter MRR themselves, in dollars and cents. It is self-reported and not independently verified.",
      "Every public figure shows when it was last updated, so an old figure may no longer reflect current revenue. Equal amounts are ordered by the date the product was listed. Category filters keep the overall rank, and a shared MRR of $0 is ranked too.",
    ],
  },
  {
    title: "What is public",
    body: [
      "Product details, maker profiles, logos and photos are public. MRR, paying customers and launch date are optional and private by default, each with its own sharing setting. Products without public MRR are still listed in Browse.",
      "Every save stores a dated metric report that only the maker can see. Turning sharing off removes that figure from public pages and the leaderboard right away. Information that was public before may already have been copied by others.",
    ],
  },
  {
    title: "What this is not",
    body: [
      "The SaaS Harbor is a directory and leaderboard. There are no sales, deal rooms, messages or payments here.",
    ],
  },
];

export default function About() {
  return (
    <Shell size="narrow">
      <PageHeader
        title="How The SaaS Harbor works"
        description="A public directory of independent SaaS, with an optional revenue leaderboard."
      />
      <div className="grid gap-10 border-t pt-10">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-lg font-semibold">{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph.slice(0, 24)} className="mt-3 leading-7 text-foreground/85">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
        <div>
          <Button asChild>
            <Link href="/dashboard/saas/new">Submit your SaaS</Link>
          </Button>
        </div>
      </div>
    </Shell>
  );
}
