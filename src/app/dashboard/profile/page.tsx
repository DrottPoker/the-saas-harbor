import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "@/components/link";
import { ClientMessages } from "@/components/client-messages";
import { ModerationNotice } from "@/components/moderation-notice";
import { ProfileForm } from "@/components/profile/profile-form";
import { PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { usernameLockDays } from "@/lib/account";
import { requireUser } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account.profile"))("metaTitle") };
}

// Account settings, such as the password and deleting the account, are in Settings.
export default async function EditProfile() {
  const { user, client } = await requireUser();
  const [profile, usernameLock, t] = await Promise.all([
    client.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    client.rpc("username_change_available_at"),
    getTranslations("account.profile"),
  ]);
  if (profile.error || usernameLock.error) throw new Error("Your profile could not be loaded.");
  return (
    <Shell size="medium">
      <PageHeader
        className="border-b"
        title={t("title")}
        description={t("description")}
        actions={
          profile.data &&
          !profile.data.suspended_at && (
            <Button asChild variant="outline">
              <Link href={`/users/${profile.data.slug}`}>{t("view")}</Link>
            </Button>
          )
        }
      />
      {profile.data?.suspended_at && (
        <ModerationNotice
          kind="account"
          at={profile.data.suspended_at}
          reason={profile.data.suspended_reason}
          note={profile.data.suspended_note}
          className="mt-8"
        />
      )}
      <div className="pt-8">
        <ClientMessages namespaces={["account"]}>
          <ProfileForm
            profile={profile.data}
            usernameLockDays={usernameLock.data ? usernameLockDays(usernameLock.data) : null}
          />
        </ClientMessages>
      </div>
    </Shell>
  );
}
