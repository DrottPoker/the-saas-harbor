import { markImage } from "@/components/og-card";
import { icoFile } from "@/lib/ico";

// For browsers and services that ask for /favicon.ico instead of reading the page's icon links.
// Next.js cannot generate a favicon file from code, so this route draws the logo into one when the
// site is built.
export const dynamic = "force-static";

export async function GET() {
  const images = await Promise.all(
    [16, 32, 48].map(async (size) => ({
      size,
      png: new Uint8Array(await markImage(size).arrayBuffer()),
    })),
  );
  return new Response(icoFile(images), { headers: { "Content-Type": "image/x-icon" } });
}
