"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { vercelEvent } from "@/lib/analytics";

/**
 * Vercel Web Analytics (cookieless page views) and Speed Insights (page load and response times),
 * rendered by the root layout in production only. Both send the same cleaned addresses.
 */
export function VercelAnalytics() {
  return (
    <>
      <Analytics beforeSend={vercelEvent} />
      <SpeedInsights beforeSend={vercelEvent} />
    </>
  );
}
