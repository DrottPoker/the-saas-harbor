import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Account deleted", robots: { index: false } };

export default function AccountDeleted() {
  return (
    <Shell size="narrow">
      <PageHeader
        title="Your account has been deleted"
        description="Your profile, products, images, Stripe connections, verification history and conversations are gone, and your products have left the leaderboard."
      />
      <div className="grid gap-4 border-t pt-8 leading-7 text-foreground/85">
        <p>
          If you connected Stripe, you can also delete the restricted keys in your Stripe account
          under <span className="whitespace-nowrap">Developers → API keys</span>. We no longer have
          a copy of them.
        </p>
        <p>
          Pages that were public can still show up in search engines for a while, until they update.
        </p>
        <div className="pt-2">
          <Button asChild>
            <Link href="/">Back to the leaderboard</Link>
          </Button>
        </div>
      </div>
    </Shell>
  );
}
