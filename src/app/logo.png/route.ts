import { markImage } from "@/components/og-card";
import { LOGO_SIZE } from "@/lib/structured-data";

// The organization's logo in the home page's structured data. Search engines want a square raster
// image of at least 112 pixels.
export const dynamic = "force-static";

export function GET() {
  return markImage(LOGO_SIZE);
}
