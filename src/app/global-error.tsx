"use client";
import "./globals.css";
import { Button } from "@/components/ui/button";

// Replaces the root layout when it fails, so it renders its own document. It has no inline
// theme script: the nonce the policy requires is not available here, and the theme then follows
// the operating system.
export default function GlobalError({ retry }: { error: Error; retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <title>Something went wrong | The SaaS Harbor</title>
        <main className="mx-auto max-w-md px-4 pt-32 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">The SaaS Harbor could not load</h1>
          <p className="mt-2 text-muted-foreground">Please try again in a moment.</p>
          <Button onClick={() => retry()} className="mt-8">
            Try again
          </Button>
        </main>
      </body>
    </html>
  );
}
