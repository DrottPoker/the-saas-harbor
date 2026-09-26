import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PAGE_SIZE } from "@/lib/data";
import { currentUser } from "@/lib/supabase/server";
import { Button } from "./ui/button";

/** The next free place on the leaderboard, while few real products are ranked. */
function openSpot(ranked: number) {
  if (ranked >= PAGE_SIZE) return null;
  return {
    rank: ranked + 1,
    title: ranked === 0 ? "is still free" : "is next",
    body:
      ranked === 0
        ? "Listing needs no revenue check. Connect your payment provider, now or later, to take the top spot."
        : `Only ${ranked} ${ranked === 1 ? "product is" : "products are"} ranked so far. Connect your payment provider, now or later, to join them.`,
  };
}

/**
 * The top of the leaderboard, which is the home page: an invitation to list any SaaS, verified or
 * not, and while few products are ranked, the place on the leaderboard that is still open. `ranked` is the number of real
 * products on the whole leaderboard, or null when the list is filtered or could not be read.
 */
export async function FounderHeader({ ranked }: { ranked: number | null }) {
  // Visitors create an account first; signed-in users go straight to the product form.
  const start = (await currentUser()) ? "/dashboard/saas/new" : "/auth?mode=signup";
  const spot = ranked == null ? null : openSpot(ranked);
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
      {spot && (
        <div className="flex items-center gap-5 rounded-xl border border-dashed border-brand/60 bg-surface p-5">
          <p className="text-6xl leading-none font-semibold tracking-tight text-brand tabular-nums">
            #{spot.rank}
          </p>
          <div>
            <p className="font-semibold">{spot.title}</p>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">{spot.body}</p>
          </div>
        </div>
      )}
    </div>
  );
}
