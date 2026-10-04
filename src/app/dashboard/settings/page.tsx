import { ChangeEmailForm, PasswordSettings } from "@/components/account-settings";
import { DeleteAccount } from "@/components/delete-forms";
import { EmailSettingsForm, Section } from "@/components/forms";
import { Notice, PageHeader, Shell } from "@/components/shell";
import { isAdmin } from "@/lib/admin";
import { confirmationMethod, signedInWithin } from "@/lib/auth";
import { firstValues, type SearchParams } from "@/lib/params";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

/** The account itself: its email address, password, the emails it gets, and deleting it. */
export default async function Settings({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { user, client } = await requireUser();
  const params = firstValues(await searchParams);
  const [{ data: settings, error }, admin, claims] = await Promise.all([
    client
      .from("notification_settings")
      .select("messages, reports, milestones")
      .eq("user_id", user.id)
      .maybeSingle(),
    isAdmin(),
    client.auth.getClaims(),
  ]);
  if (error) throw new Error("Your settings could not be loaded.");
  const method = confirmationMethod(user);
  return (
    <Shell size="medium">
      <PageHeader
        className="border-b"
        title="Settings"
        description="Your email address, password and the emails you get."
      />
      {params.email === "changed" && (
        <Notice tone="success" className="mt-8">
          Your email address is changed to {user.email}.
        </Notice>
      )}
      <div className="pt-8">
        <Section
          id="email"
          title="Email address"
          description="Where we send sign-in links and notifications."
        >
          <ChangeEmailForm email={user.email ?? ""} />
        </Section>
        <Section id="password" title="Password" description="Used to sign in with your email.">
          <PasswordSettings method={method} />
        </Section>
        <Section
          id="notifications"
          title="Notifications"
          description={`Emails go to ${user.email}.`}
        >
          <EmailSettingsForm
            messages={settings?.messages ?? true}
            reports={settings?.reports ?? true}
            milestones={settings?.milestones ?? true}
            admin={admin}
          />
          <p className="text-sm text-muted-foreground">
            Emails about decisions on your products or account, and about the outcome of reports you
            send, are always sent. Sign-in and password emails are too.
          </p>
        </Section>
      </div>
      <DeleteAccount
        method={method}
        confirmed={signedInWithin(claims.data?.claims.amr, "oauth", 5 * 60)}
        failed={params.confirm === "failed"}
      />
    </Shell>
  );
}
