import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ChangeEmailForm, PasswordSettings } from "@/components/account-settings";
import { ClientMessages } from "@/components/client-messages";
import { DeleteAccount } from "@/components/delete-forms";
import { EmailSettingsForm, Section } from "@/components/forms";
import { Notice, PageHeader, Shell } from "@/components/shell";
import { isAdmin } from "@/lib/admin";
import { confirmationMethod, signedInWithin } from "@/lib/auth";
import { firstValues, type SearchParams } from "@/lib/params";
import { requireUser } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account.settings"))("title") };
}

/** The account itself: its email address, password, the emails it gets, and deleting it. */
export default async function Settings({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { user, client } = await requireUser();
  const params = firstValues(await searchParams);
  const [{ data: settings, error }, admin, claims, t] = await Promise.all([
    client
      .from("notification_settings")
      .select("messages, reports, milestones")
      .eq("user_id", user.id)
      .maybeSingle(),
    isAdmin(),
    client.auth.getClaims(),
    getTranslations("account.settings"),
  ]);
  if (error) throw new Error("Your settings could not be loaded.");
  const method = confirmationMethod(user);
  const email = user.email ?? "";
  return (
    <Shell size="medium">
      <PageHeader className="border-b" title={t("title")} description={t("description")} />
      {params.email === "changed" && (
        <Notice tone="success" className="mt-8">
          {t("emailChanged", { email })}
        </Notice>
      )}
      <ClientMessages namespaces={["account"]}>
        <div className="pt-8">
          <Section id="email" title={t("emailTitle")} description={t("emailDescription")}>
            <ChangeEmailForm email={email} />
          </Section>
          <Section id="password" title={t("passwordTitle")} description={t("passwordDescription")}>
            <PasswordSettings method={method} />
          </Section>
          <Section
            id="notifications"
            title={t("notificationsTitle")}
            description={t("notificationsDescription", { email })}
          >
            <EmailSettingsForm
              messages={settings?.messages ?? true}
              reports={settings?.reports ?? true}
              milestones={settings?.milestones ?? true}
              admin={admin}
            />
            <p className="text-sm text-muted-foreground">{t("alwaysSent")}</p>
          </Section>
        </div>
        <DeleteAccount
          method={method}
          confirmed={signedInWithin(claims.data?.claims.amr, "oauth", 5 * 60)}
          failed={params.confirm === "failed"}
        />
      </ClientMessages>
    </Shell>
  );
}
