import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { DeleteAccount } from "@/components/delete-forms";
import { ProfileForm } from "@/components/profile/profile-form";
import { PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Edit profile" };

export default async function EditProfile() {
  const { user, client } = await requireUser();
  const [profile, entries] = await Promise.all([
    client.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    client.from("profile_entries").select("*").eq("profile_id", user.id),
  ]);
  if (profile.error || entries.error) throw new Error("Your profile could not be loaded.");
  return (
    <Shell size="medium">
      <BackLink href="/dashboard">Dashboard</BackLink>
      <PageHeader
        className="mt-4 border-b"
        title="Maker profile"
        description="Everything on your maker profile is public."
        actions={
          profile.data && (
            <Button asChild variant="outline">
              <Link href={`/makers/${user.id}`}>View profile</Link>
            </Button>
          )
        }
      />
      <div className="pt-8">
        <ProfileForm
          profile={profile.data}
          entries={entries.data}
          thisYear={new Date().getUTCFullYear()}
        />
      </div>
      <DeleteAccount />
    </Shell>
  );
}
