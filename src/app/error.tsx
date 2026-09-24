"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <section className="prose-shell">
      <p className="eyebrow">A BRIEF DETOUR</p>
      <h1>We couldn&apos;t load this page.</h1>
      <p>
        Please try again. If this keeps happening, check the Supabase connection and the setup
        instructions.
      </p>
      {/* retry() re-fetches server data; reset() would only re-render the failed result. */}
      <Button onClick={() => retry()}>Try again</Button>
    </section>
  );
}
