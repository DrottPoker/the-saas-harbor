import type { NextRequest } from "next/server";
import { adminSession } from "@/lib/admin";
import { reportRequestSchema, reportSchemas, type ReportRequest } from "@/lib/analytics-reports";

const noStore = { "Cache-Control": "private, no-store" };

function call(
  client: NonNullable<Awaited<ReturnType<typeof adminSession>>>["client"],
  request: ReportRequest,
) {
  switch (request.report) {
    case "live":
      return client.rpc("admin_analytics_live");
    case "overview":
      return client.rpc("admin_analytics_overview", { p_range: request.range, p_tz: request.tz });
    case "heatmap":
      return client.rpc("admin_analytics_heatmap", { p_range: request.range, p_tz: request.tz });
    case "behavior":
      return client.rpc("admin_analytics_behavior", { p_range: request.range, p_tz: request.tz });
    case "platform":
      return client.rpc("admin_analytics_platform", { p_range: request.range, p_tz: request.tz });
    case "breakdown":
      return client.rpc("admin_analytics_breakdown", {
        p_range: request.range,
        p_tz: request.tz,
        p_dimension: request.dimension,
        p_limit: request.limit,
      });
  }
}

// One report for a card of the Analytics page, read by the browser so a card changes its period
// without reloading the page. Admins only; everyone else gets a 404, like the admin pages. The
// database checks admin rights again.
export async function GET(request: NextRequest) {
  const session = await adminSession();
  if (!session) return new Response("Not found", { status: 404, headers: noStore });
  const parsed = reportRequestSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return new Response("Bad request", { status: 400, headers: noStore });
  const { data, error } = await call(session.client, parsed.data);
  if (error) {
    console.error("An analytics report could not be loaded:", error.code);
    return new Response("The report could not be loaded", { status: 500, headers: noStore });
  }
  const report = reportSchemas[parsed.data.report].safeParse(data);
  if (!report.success) {
    console.error("An analytics report was malformed:", parsed.data.report);
    return new Response("The report could not be loaded", { status: 500, headers: noStore });
  }
  return Response.json(report.data, { headers: noStore });
}
