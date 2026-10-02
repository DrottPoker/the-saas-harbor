import { markImage } from "@/components/og-card";

// The icon search results show beside the site. Google takes no SVG favicon, so this PNG comes
// before icon1.svg, which browsers still choose since it follows the color scheme.
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return markImage(size.width);
}
