import { BackLink } from "@/components/back-link";
import { EmailSettingsForm, Section } from "@/components/forms";
import { PageHeader, Shell } from "@/components/shell";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Email settings" };

export default async function EmailSettings() {
  const { user, client } = await requireUser();
  const [{ data: settings, error }, admin] = await Promise.all([
    client
      .from("notification_settings")
      .select("messages, reports")
      .eq("user_id", user.id)
      .maybeSingle(),
    isAdmin(),
  ]);
  if (error) throw new Error("Your settings could not be loaded.");
  return (
    <Shell size="medium">
      <BackLink href="/dashboard">Dashboard</BackLink>
      <PageHeader
        className="mt-4 border-b"
        title="Email settings"
        description="Choose which emails you get from The SaaS Harbor."
      />
      <div className="pt-8">
        <Section title="Notifications" description={`Emails go to ${user.email}.`}>
          <EmailSettingsForm
            messages={settings?.messages ?? true}
            reports={settings?.reports ?? true}
            admin={admin}
          />
        </Section>
        <p className="border-t pt-6 text-sm text-muted-foreground">
          Emails about decisions on your products or account, and about the outcome of reports you
          send, are always sent. Sign-in and password emails are too.
        </p>
      </div>
    </Shell>
  );
}
