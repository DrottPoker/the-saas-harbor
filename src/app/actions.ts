"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { profileSchema, saasSchema, type ActionState } from "@/lib/domain";
import { requireUser, serverClient } from "@/lib/supabase/server";
import { uploadImage } from "@/lib/upload";

const value = (form: FormData, key: string) => String(form.get(key) ?? "");
function message(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Check the form fields.";
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export async function authenticate(mode: string, _state: ActionState, form: FormData): Promise<ActionState> {
  const email = value(form, "email").trim();
  const password = value(form, "password");
  if (mode !== "update" && !z.email().safeParse(email).success) return { error: "Enter a valid email address." };
  if (mode !== "reset" && (password.length < (mode === "login" ? 1 : 12) || password.length > 128)) return { error: "Use a password between 12 and 128 characters." };
  const client = await serverClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  if (mode === "signup") {
    const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/auth/callback` } });
    if (error) return { error: error.code === "over_email_send_rate_limit" ? "Email limit reached. Please wait before trying again." : "Registration could not be completed. Try again or sign in if you already have an account." };
    if (!data.session) return { success: "Check your email to confirm your account, then sign in. If no email arrives, the project owner may need to configure email delivery." };
  } else if (mode === "reset") {
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=update` });
    if (error) return { error: "The reset email could not be sent. Try again later." };
    return { success: "If an account exists, you will receive a password reset link." };
  } else if (mode === "update") {
    await requireUser();
    const { error } = await client.auth.updateUser({ password });
    if (error) return { error: "Password could not be updated. Request a new reset link." };
  } else {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { error: "Unable to sign in. Check your email and password, and confirm your email first." };
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOut() {
  const client = await serverClient();
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw new Error("Unable to sign out. Please try again.");
  revalidatePath("/", "layout");
  redirect("/");
}

export async function saveProfile(_state: ActionState, form: FormData): Promise<ActionState> {
  const { user, client } = await requireUser();
  let uploaded: string | null = null;
  try {
    const fields = profileSchema.parse(Object.fromEntries(["name", "bio", "website", "social_url"].map(key => [key, value(form, key)])));
    const { data: existing, error: readError } = await client.from("profiles").select("avatar_path").eq("id", user.id).maybeSingle();
    if (readError) return { error: "Your profile could not be loaded. Please try again." };
    uploaded = await uploadImage(client, user.id, form.get("image"));
    const avatar_path = uploaded || (form.has("remove_image") ? null : existing?.avatar_path ?? null);
    const { error } = await client.from("profiles").upsert({ ...fields, id: user.id, avatar_path, updated_at: new Date().toISOString() });
    if (error) throw new Error("Your profile could not be saved. Please try again.");
  } catch (error) {
    if (uploaded) await client.storage.from("profile-images").remove([uploaded]);
    return { error: message(error) };
  }
  revalidatePath("/", "layout");
  return { success: "Your public profile has been saved." };
}

export async function saveSaas(_state: ActionState, form: FormData): Promise<ActionState> {
  const { user, client } = await requireUser();
  let uploaded: string | null = null;
  let savedId: string;
  try {
    const fields = saasSchema.parse({ ...Object.fromEntries(["id", "name", "tagline", "description", "category", "website", "mrr", "customers", "launched_on"].map(key => [key, value(form, key)])), public_mrr: form.has("public_mrr"), public_customers: form.has("public_customers"), public_launch: form.has("public_launch") });
    const { data: existing, error: readError } = await client.from("saas").select("owner_id, logo_path").eq("id", fields.id).maybeSingle();
    if (readError) return { error: "The SaaS profile could not be loaded." };
    if (existing && existing.owner_id !== user.id) return { error: "You can only edit your own SaaS." };
    uploaded = await uploadImage(client, user.id, form.get("image"));
    const { data, error } = await client.rpc("save_saas", {
      p_id: fields.id, p_name: fields.name, p_tagline: fields.tagline, p_description: fields.description,
      p_category: fields.category, p_website: fields.website,
      p_logo_path: uploaded || (form.has("remove_image") ? null : existing?.logo_path ?? null),
      p_mrr_cents: fields.mrr, p_customers: fields.customers, p_launched_on: fields.launched_on || null,
      p_public_mrr: fields.public_mrr, p_public_customers: fields.public_customers, p_public_launch: fields.public_launch,
    });
    if (error) throw new Error("The SaaS profile could not be saved. Please check your fields and try again.");
    savedId = data;
  } catch (error) {
    if (uploaded) await client.storage.from("profile-images").remove([uploaded]);
    return { error: message(error) };
  }
  revalidatePath("/", "layout");
  redirect(`/dashboard?saved=${savedId}`);
}

