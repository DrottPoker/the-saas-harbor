import Link from "next/link";
import { ProfileForm } from "@/components/forms";
import { requireUser } from "@/lib/supabase/server";
export const metadata = { title: "Edit profile" };
export default async function EditProfile() {
  const { user, client } = await requireUser();
  const { data, error } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw new Error("Your profile could not be loaded.");
  return (
    <div className="editor-shell">
      <Link className="back-link" href="/dashboard">
        ← My harbor
      </Link>
      <p className="eyebrow">THE PERSON BEHIND THE PRODUCTS</p>
      <h1>Your maker profile.</h1>
      <p className="muted editor-description">
        Introduce yourself. Everything on this profile is public.
      </p>
      <div className="editor-card">
        <ProfileForm profile={data} />
      </div>
    </div>
  );
}
