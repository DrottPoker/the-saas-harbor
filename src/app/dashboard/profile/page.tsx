import { ProfileForm } from "@/components/forms";
import { BackLink } from "@/components/back-link";
import { DeleteAccount } from "@/components/delete-forms";
import { PageHeader, Shell } from "@/components/shell";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Edit profile" };

export default async function EditProfile() {
  const { user, client } = await requireUser();
  const { data, error } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw new Error("Your profile could not be loaded.");
  return (
    <Shell size="medium">
      <BackLink href="/dashboard">Dashboard</BackLink>
      <PageHeader
        className="mt-4 border-b"
        title="Maker profile"
        description="Everything on your maker profile is public."
      />
      <div className="pt-8">
        <ProfileForm profile={data} />
      </div>
      <DeleteAccount />
    </Shell>
  );
}
