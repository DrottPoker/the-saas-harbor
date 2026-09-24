"use client";
import "./globals.css";
import { Button } from "@/components/ui/button";

// Replaces the root layout when it fails, so it renders its own document.
export default function GlobalError({ retry }: { error: Error; retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <title>Something went wrong | The SaaS Harbor</title>
        <main className="prose-shell">
          <p className="eyebrow">A BRIEF DETOUR</p>
          <h1>The harbor could not be loaded.</h1>
          <p>Please try again in a moment.</p>
          <Button onClick={() => retry()}>Try again</Button>
        </main>
      </body>
    </html>
  );
}
