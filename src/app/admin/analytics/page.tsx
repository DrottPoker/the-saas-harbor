import { AnalyticsDashboard } from "@/components/admin/analytics/dashboard";
import { PageHeader } from "@/components/shell";
import { requireAdmin } from "@/lib/admin";

export const metadata = { title: "Analytics" };

export default async function AdminAnalytics() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Visits to the site and activity on it, counted without cookies. Bots, admin pages and signed-in admins are left out."
      />
      <AnalyticsDashboard />
    </>
  );
}
