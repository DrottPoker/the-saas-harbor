import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { currentUser } from "@/lib/supabase/server";
import { Button } from "./ui/button";

const gains = [
  "A public page for your product",
  "A link to your website",
  "Page views and messages from other founders",
  "A place on the leaderboard, if you connect your revenue",
];

/**
 * The top of the leaderboard, which is the home page: an invitation to list any SaaS, verified or
 * not, and what a listing gives.
 */
export async function FounderHeader() {
  // Visitors create an account first; signed-in users go straight to the product form.
  const start = (await currentUser()) ? "/dashboard/saas/new" : "/auth?mode=signup";
  return (
    <div className="grid gap-6 pb-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center lg:gap-12">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Get your SaaS seen.
          <br />
          List it for free.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Every SaaS is welcome, verified or not. You get a public page with a link to your site,
          and other founders can find you and write to you. Connecting your payment provider is
          optional and puts you on the leaderboard.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Button asChild size="lg">
            <Link href={start}>
              List your SaaS
              <ArrowRight />
            </Link>
          </Button>
          <Link href="/about" className="text-sm font-medium underline-offset-4 hover:underline">
            How it works
          </Link>
        </div>
      </div>
      <section aria-labelledby="listing-gains" className="rounded-xl border bg-surface p-5">
        <h2 id="listing-gains" className="font-semibold">
          Free for every SaaS
        </h2>
        <ul className="mt-3 grid gap-2.5 text-sm">
          {gains.map((gain) => (
            <li key={gain} className="flex gap-2.5">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
              {gain}
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t pt-3 text-[13px] text-muted-foreground">
          No payment details and no revenue check needed.
        </p>
      </section>
    </div>
  );
}
