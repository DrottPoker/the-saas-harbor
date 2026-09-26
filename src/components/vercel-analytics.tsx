"use client";

import { Analytics } from "@vercel/analytics/next";
import { vercelEvent } from "@/lib/analytics";

/** Vercel Web Analytics: cookieless page views, rendered by the root layout in production only. */
export function VercelAnalytics() {
  return <Analytics beforeSend={vercelEvent} />;
}
