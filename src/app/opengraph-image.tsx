import { OG_SIZE, siteImage } from "@/components/og-card";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "The SaaS Harbor: Get your SaaS seen. List it for free, with a public page and a place on a leaderboard of revenue verified through Stripe, Paddle and other payment providers.";

export default function Image() {
  return siteImage();
}
