import { OG_SIZE, siteImage } from "@/components/og-card";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "The SaaS Harbor: independent SaaS, ranked by revenue verified through their payment providers";
// The figures are live, so the image is drawn per request rather than at build time.
export const dynamic = "force-dynamic";

export default function Image() {
  return siteImage();
}
