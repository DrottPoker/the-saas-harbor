import { OG_SIZE, siteImage } from "@/components/og-card";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "The SaaS Harbor: free exposure for small SaaS. List your product for free, with a public page and revenue verified through its payment provider.";

export default function Image() {
  return siteImage();
}
