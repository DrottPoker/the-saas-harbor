import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { DeleteAccount } from "@/components/delete-forms";
import { ModerationNotice } from "@/components/moderation-notice";
import { ProfileForm } from "@/components/profile/profile-form";
import { PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Edit profile" };

export default async function EditProfile() {
  const { user, client } = await requireUser();
  const [profile, experience, usernameLock] = await Promise.all([
    client.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    client.from("profile_experience").select("*").eq("profile_id", user.id),
    client.rpc("username_change_available_at"),
  ]);
  if (profile.error || experience.error || usernameLock.error)
    throw new Error("Your profile could not be loaded.");
  return (
    <Shell size="medium">
      <BackLink href="/dashboard">Dashboard</BackLink>
      <PageHeader
        className="mt-4 border-b"
        title="Profile"
        description="Everything on your profile is public."
        actions={
          profile.data &&
          !profile.data.suspended_at && (
            <Button asChild variant="outline">
              <Link href={`/users/${profile.data.slug}`}>View profile</Link>
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
        <ProfileForm
          profile={profile.data}
          experience={experience.data}
          usernameAvailableAt={usernameLock.data}
          thisYear={new Date().getUTCFullYear()}
        />
      </div>
      <DeleteAccount />
    </Shell>
  );
}
