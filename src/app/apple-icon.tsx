import { markImage } from "@/components/og-card";

// The icon iOS and Safari show for the site, for example on the home screen.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return markImage(size.width, { background: true });
}
