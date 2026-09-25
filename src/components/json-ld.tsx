import { headers } from "next/headers";
import { serializeJsonLd } from "@/lib/structured-data";

/** Structured data for the page. It carries the request's nonce like every other script. */
export async function JsonLd({ data }: { data: Record<string, unknown> }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // Browsers hide nonce values from the DOM, so hydration would see a mismatch.
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
