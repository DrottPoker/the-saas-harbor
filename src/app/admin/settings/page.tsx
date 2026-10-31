import { Panel } from "@/components/admin/panel";
import { ListingSettingsForm } from "@/components/admin/listing-settings-form";
import { PageHeader } from "@/components/shell";
import { requireAdmin } from "@/lib/admin";
import { listingSettings } from "@/lib/listing-settings";

export const metadata = { title: "Settings" };

export default async function AdminSettings() {
  await requireAdmin();
  const { allowOtherProvider } = await listingSettings();
  return (
    <>
      <PageHeader title="Settings" description="Manage the requirements for listing a SaaS." />
      <div className="max-w-2xl">
        <Panel id="listing-settings" title="Payment providers">
          <ListingSettingsForm allowOtherProvider={allowOtherProvider} />
        </Panel>
      </div>
    </>
  );
}
