import Link from "next/link";
import { ArrowRight, Eye, FileText, MessageSquare, ShieldCheck, Trophy } from "lucide-react";
import { PAGE_SIZE } from "@/lib/data";
import { currentUser } from "@/lib/supabase/server";
import { Button } from "./ui/button";

const steps = [
  {
    title: "Create a free account",
    body: "An email address, a password and a username.",
  },
  {
    title: "Add your product",
    body: "Name, tagline, description and website. Its page goes live when you save.",
  },
  {
    title: "Verify your revenue",
    body: "Paste a read-only key from Stripe, Paddle, Polar or Dodo Payments to join the leaderboard. You can also do this later.",
  },
];

const benefits = [
  {
    icon: FileText,
    title: "A page for your product",
    body: "Your pitch, the figures you choose to share and a link to your site. Search engines follow the link once your revenue is verified.",
  },
  {
    icon: Trophy,
    title: "A place on the leaderboard",
    body: "Rank by verified MRR, and show it on your own site with a badge.",
  },
  {
    icon: Eye,
    title: "See who views it",
    body: "See how many people open your product page. Your own visits are not counted.",
  },
  {
    icon: MessageSquare,
    title: "Meet other founders",
    body: "Founders can write to you about your product, and you can write to them.",
  },
];

/** How early a founder is, from the number of products ranked by verified revenue. */
function earlyNote(ranked: number) {
  if (ranked === 0) return "The leaderboard just opened. Rank #1 is still free.";
  if (ranked < PAGE_SIZE)
    return `The leaderboard just opened, with ${ranked} verified ${ranked === 1 ? "product" : "products"} so far. Get in early.`;
  return `Join the ${ranked} products ranked by verified revenue.`;
}

/**
 * The top of the home page, for founders: what listing a product gives them and how to start.
 * `ranked` is the number of real products on the leaderboard, or null when it is not known.
 */
export async function FounderHero({ ranked }: { ranked: number | null }) {
  // Visitors create an account first; signed-in users go straight to the product form.
  const start = (await currentUser()) ? "/dashboard/saas/new" : "/auth?mode=signup";
  return (
    <section aria-labelledby="founder-hero" className="pb-14 sm:pb-20">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center lg:gap-16">
        <div>
          {ranked != null && (
            <p className="inline-flex rounded-full bg-brand-soft px-3 py-1 text-[13px] font-medium text-brand">
              {earlyNote(ranked)}
            </p>
          )}
          <h1 id="founder-hero" className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
            Free exposure for your SaaS
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            List your product for free and get a public page, a place on a leaderboard ranked by
            verified revenue, and other founders who can find you.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href={start}>
                List your SaaS for free
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/about">How it works</Link>
            </Button>
          </div>
          <p className="mt-5 flex max-w-2xl gap-2 text-[13px] leading-5 text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
            <span>
              Revenue is read with a read-only key that is stored encrypted and can be revoked at
              any time. Your figures stay private until you share them.
            </span>
          </p>
        </div>
        <div className="rounded-xl border bg-surface p-6">
          <h2 className="font-semibold">Listed in three steps</h2>
          <ol className="mt-5 grid gap-5">
            {steps.map(({ title, body }, index) => (
              <li key={title} className="flex gap-3.5">
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand"
                >
                  {index + 1}
                </span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="mt-0.5 block text-sm leading-6 text-muted-foreground">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <h2 className="sr-only">What a listing gives you</h2>
      <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {benefits.map(({ icon: Icon, title, body }) => (
          <li key={title} className="rounded-xl border bg-surface p-5">
            <Icon aria-hidden="true" className="size-5 text-brand" />
            <h3 className="mt-3 font-semibold">{title}</h3>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
