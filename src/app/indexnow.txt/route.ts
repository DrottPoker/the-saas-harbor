import { INDEXNOW_KEY } from "@/lib/indexnow";

// The key that shows IndexNow notices come from this site (src/lib/indexnow.ts).
export const dynamic = "force-static";

export function GET() {
  return new Response(INDEXNOW_KEY, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
