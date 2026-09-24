import Link from "next/link";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Shell size="narrow" className="pt-24 text-center sm:pt-32">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-muted-foreground">
        This page does not exist, or it is not available to you.
      </p>
      <Button asChild variant="outline" className="mt-8">
        <Link href="/">Back to the leaderboard</Link>
      </Button>
    </Shell>
  );
}
