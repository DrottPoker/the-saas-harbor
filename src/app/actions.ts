"use server";

import { redirect, RedirectType } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteAccount } from "@/lib/account";
import { parseSkills } from "@/lib/profile";
import {
  emailLink,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  profileSchema,
  safeNext,
  saasSchema,
  normalizeUsername,
  USERNAME_PROBLEMS,
  usernameLockedMessage,
  usernameSchema,
  type ActionState,
} from "@/lib/domain";
import { addressAcceptsMail } from "@/lib/email-domain";
import { termsUpdated } from "@/lib/legal";
import { requireUser, serverClient } from "@/lib/supabase/server";
import { uploadImage } from "@/lib/upload";

const value = (form: FormData, key: string) => String(form.get(key) ?? "");
function message(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Check the form fields.";
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

async function openedFromEmailLink(client: Awaited<ReturnType<typeof serverClient>>) {
  const { data } = await client.auth.getClaims();
  const amr: unknown = data?.claims.amr;
  const since = Date.now() / 1000 - 15 * 60;
  return (
    Array.isArray(amr) &&
    amr.some((entry) => entry?.method === "otp" && Number(entry?.timestamp) >= since)
  );
}

// What is wrong with the email address, password and, for sign-up, the Terms of Service box.
async function detailsProblem(mode: string, email: string, password: string, form: FormData) {
  if (mode !== "update" && !z.email().safeParse(email).success)
    return "Enter a valid email address.";
  const minimum = mode === "login" ? 1 : PASSWORD_MIN_LENGTH;
  if (mode !== "reset" && (password.length < minimum || password.length > PASSWORD_MAX_LENGTH))
    return `Use a password between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`;
  if (mode === "signup" && form.get("terms") !== "on")
    return "Tick the box to accept the Terms of Service.";
  if (mode === "signup" && !(await addressAcceptsMail(email)))
    return "This email address cannot receive email. Check it for typos.";
  return null;
}

// Why a username cannot be used by the current visitor or user, or null when it can.
async function usernameProblem(
  client: Awaited<ReturnType<typeof serverClient>>,
  input: string,
): Promise<{ username: string; problem: string | null }> {
  const parsed = usernameSchema.safeParse(input);
  if (!parsed.success) return { username: input, problem: message(parsed.error) };
  const { data, error } = await client.rpc("check_username", { p_username: parsed.data });
  if (error) return { username: parsed.data, problem: "The username could not be checked." };
  return { username: parsed.data, problem: data && USERNAME_PROBLEMS[data] };
}

/** The first sign-up step: the details are checked before the username is asked for. */
export async function checkSignupDetails(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const problem = await detailsProblem(
    "signup",
    value(form, "email").trim(),
    value(form, "password"),
    form,
  );
  return problem ? { error: problem } : { success: "details" };
}

export async function authenticate(
  mode: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const email = value(form, "email").trim();
  const password = value(form, "password");
  const problem = await detailsProblem(mode, email, password, form);
  if (problem) return { error: problem };
  const client = await serverClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";
  // Both emails link to the confirm page, which verifies the token in whichever browser opens it.
  const confirm = `${origin}/auth/confirm`;
  if (mode === "signup") {
    const { username, problem: taken } = await usernameProblem(client, value(form, "username"));
    if (taken) return { error: taken };
    const { data, error } = await client.auth.signUp({
      email,
      password,
      // Triggers create the profile with the username (as name and address) and copy the
      // accepted version of the terms into private.terms_acceptances.
      options: { emailRedirectTo: confirm, data: { terms_version: termsUpdated, username } },
    });
    if (error)
      return {
        error:
          error.code === "over_email_send_rate_limit"
            ? "Email limit reached. Please wait before trying again."
            : "Registration could not be completed. Try again or sign in if you already have an account.",
      };
    if (!data.session)
      return {
        success: "Check your email and open the link to confirm your account.",
      };
  } else if (mode === "reset") {
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: confirm });
    if (error) return { error: "The reset email could not be sent. Try again later." };
    return { success: "If an account exists, you will receive a password reset link." };
  } else if (mode === "update") {
    await requireUser();
    // Only a session opened from an email link in the last 15 minutes may set a new password, so
    // a stolen session cannot take over the account. Every other session ends afterwards.
    if (!(await openedFromEmailLink(client)))
      return { error: "This reset link has expired. Request a new one to choose a password." };
    const { error } = await client.auth.updateUser({ password });
    if (error) return { error: "Password could not be updated. Request a new reset link." };
    await client.auth.signOut({ scope: "others" });
  } else {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error)
      return {
        error: "Unable to sign in. Check your email and password, and confirm your email first.",
      };
  }
  revalidatePath("/", "layout");
  redirect((mode === "login" && safeNext(value(form, "next"))) || "/dashboard");
}

export async function saveEmailSettingsAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client } = await requireUser();
  const { error } = await client.rpc("save_notification_settings", {
    p_messages: form.has("messages"),
    // Only admins see the report setting; everyone else keeps the default.
    p_reports: form.has("reports_shown") ? form.has("reports") : true,
  });
  if (error) return { error: "Your settings could not be saved. Please try again." };
  return { success: "Settings saved." };
}

// The confirm page submits the token from an email link. Verifying it here, on a button press
// rather than when the page loads, keeps email link scanners from using the link up.
export async function confirmEmailLinkAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const link = emailLink(value(form, "token_hash"), value(form, "type"));
  if (!link) return { error: "This link is incomplete. Open it again from the email." };
  const client = await serverClient();
  const { data, error } = await client.auth.verifyOtp({
    token_hash: link.tokenHash,
    type: link.type,
  });
  if (error)
    return {
      error:
        link.type === "recovery"
          ? "This link has expired or has already been used. Request a new reset link."
          : "This link has expired or has already been used. Sign in if you confirmed your email before, or sign up again to get a new link.",
    };
  revalidatePath("/", "layout");
  if (link.type === "recovery") redirect("/auth?mode=update");
  redirect(await startPage(client, data.user?.id));
}

/** Where a confirmed account starts: listing its first product, until it has one. */
async function startPage(client: Awaited<ReturnType<typeof serverClient>>, userId?: string) {
  if (!userId) return "/dashboard";
  const { count, error } = await client
    .from("saas")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId);
  return !error && count === 0 ? "/dashboard/saas/new" : "/dashboard";
}

export async function signOut() {
  const client = await serverClient();
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw new Error("Unable to sign out. Please try again.");
  revalidatePath("/", "layout");
  redirect("/");
}

export async function deleteAccountAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { user, client } = await requireUser();
  const password = value(form, "password");
  if (!password || password.length > 128) return { error: "Enter your password to confirm." };
  if (!user.email) return { error: "Your account could not be deleted. Try again." };
  try {
    await deleteAccount(user.id, user.email, password);
  } catch (error) {
    return { error: message(error) };
  }
  // The account no longer exists, so this only clears the session cookies in this browser.
  await client.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect("/account-deleted", RedirectType.replace);
}

type Client = Awaited<ReturnType<typeof serverClient>>;

// A logo is removed only when it is in the maker's own folder and neither their profile photo
// nor another of their products uses the same file.
async function logoIsUnused(client: Client, owner: string, path: string, saasId: string) {
  if (!path.startsWith(`${owner}/`)) return false;
  const [profile, products] = await Promise.all([
    client.from("profiles").select("avatar_path").eq("id", owner).maybeSingle(),
    client
      .from("saas")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", owner)
      .eq("logo_path", path)
      .neq("id", saasId),
  ]);
  if (profile.error || products.error)
    throw new Error("The SaaS could not be deleted. Please try again.");
  return profile.data?.avatar_path !== path && !products.count;
}

export async function deleteSaasAction(
  saasId: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { user, client } = await requireUser();
  if (!z.uuid().safeParse(saasId).success) return { error: "You can only delete your own SaaS." };
  const { data: saas, error } = await client
    .from("saas")
    .select("name, logo_path")
    .eq("id", saasId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) return { error: "The SaaS profile could not be loaded." };
  if (!saas) return { error: "You can only delete your own SaaS." };
  if (value(form, "confirm_name").trim() !== saas.name.trim())
    return { error: "Type the product name exactly as shown to confirm." };
  try {
    // The logo goes first, so a failure leaves the product in place to delete again.
    if (saas.logo_path && (await logoIsUnused(client, user.id, saas.logo_path, saasId))) {
      const { error: removeError } = await client.storage
        .from("profile-images")
        .remove([saas.logo_path]);
      if (removeError)
        throw new Error(
          "The logo could not be deleted, so the product was kept. Please try again.",
        );
    }
    // Foreign keys remove the settings, figures, provider connection and verification history.
    const { data: deleted, error: deleteError } = await client
      .from("saas")
      .delete()
      .eq("id", saasId)
      .eq("owner_id", user.id)
      .select("id");
    if (deleteError || !deleted.length)
      throw new Error("The SaaS could not be deleted. Please try again.");
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath("/", "layout");
  redirect("/dashboard?deleted=1", RedirectType.replace);
}

// Roles arrive as JSON from the experience editor.
function experienceFrom(form: FormData) {
  try {
    const roles: unknown = JSON.parse(value(form, "experience") || "[]");
    return Array.isArray(roles) ? roles : null;
  } catch {
    return null;
  }
}

export async function saveProfile(_state: ActionState, form: FormData): Promise<ActionState> {
  const { user, client } = await requireUser();
  const uploaded: string[] = [];
  let unsaved: string | null = null;
  try {
    const experience = experienceFrom(form);
    if (!experience) return { error: "Your experience could not be read. Please try again." };
    const fields = profileSchema.parse({
      ...Object.fromEntries(
        [
          "name",
          "headline",
          "location",
          "bio",
          "website",
          "linkedin_url",
          "github_url",
          "x_url",
          "social_url",
        ].map((key) => [key, value(form, key)]),
      ),
      skills: parseSkills(value(form, "skills")),
      experience,
    });
    const { data: existing, error: readError } = await client
      .from("profiles")
      .select("avatar_path, slug")
      .eq("id", user.id)
      .maybeSingle();
    if (readError) return { error: "Your profile could not be loaded. Please try again." };
    // Only a changed username is checked, so an older, longer address can stay as it is.
    let username = normalizeUsername(value(form, "username"));
    if (username !== existing?.slug) {
      const { data: availableAt, error: lockError } = await client.rpc(
        "username_change_available_at",
      );
      if (lockError) return { error: "Your profile could not be loaded. Please try again." };
      if (availableAt) return { error: usernameLockedMessage(availableAt) };
      const checked = await usernameProblem(client, username);
      if (checked.problem) return { error: checked.problem };
      username = checked.username;
    }
    const avatar = await uploadImage(client, user.id, form.get("image"));
    if (avatar) uploaded.push(avatar);
    const { error } = await client.rpc("save_profile", {
      p_name: fields.name,
      p_headline: fields.headline,
      p_location: fields.location,
      p_bio: fields.bio,
      p_website: fields.website,
      p_linkedin_url: fields.linkedin_url,
      p_github_url: fields.github_url,
      p_x_url: fields.x_url,
      p_social_url: fields.social_url,
      p_skills: fields.skills,
      p_avatar_path: avatar || (form.has("remove_image") ? null : (existing?.avatar_path ?? null)),
      p_experience: fields.experience.map((role) => ({
        title: role.title,
        organization: role.organization,
        starts_on: `${role.start}-01`,
        ends_on: role.end && `${role.end}-01`,
        description: role.description,
      })),
    });
    if (error) throw new Error("Your profile could not be saved. Please try again.");
    // Checked above, so this fails only when someone took the username in the meantime.
    if (username !== existing?.slug) {
      const { error: usernameError } = await client.rpc("set_username", { p_username: username });
      if (usernameError)
        unsaved = usernameError.message.includes("taken")
          ? "Your profile was saved, but that username was just taken. Choose another one."
          : usernameError.message.includes("locked")
            ? "Your profile was saved, but your username was changed a moment ago."
            : "Your profile was saved, but the username could not be changed. Please try again.";
    }
  } catch (error) {
    if (uploaded.length) await client.storage.from("profile-images").remove(uploaded);
    return { error: message(error) };
  }
  revalidatePath("/", "layout");
  return unsaved ? { error: unsaved } : { success: "Profile saved." };
}

export async function saveSaas(_state: ActionState, form: FormData): Promise<ActionState> {
  const { user, client } = await requireUser();
  let uploaded: string | null = null;
  let savedId: string;
  let existed: boolean;
  try {
    const fields = saasSchema.parse({
      ...Object.fromEntries(
        ["id", "name", "tagline", "description", "category", "website", "launched_on"].map(
          (key) => [key, value(form, key)],
        ),
      ),
      share_mrr: form.has("share_mrr"),
      share_customers: form.has("share_customers"),
      share_launch: form.has("share_launch"),
      // One entry per ticked technology.
      tech_stack: form.getAll("tech").map(String),
    });
    const { data: existing, error: readError } = await client
      .from("saas")
      .select("owner_id, logo_path")
      .eq("id", fields.id)
      .maybeSingle();
    if (readError) return { error: "The SaaS profile could not be loaded." };
    if (existing && existing.owner_id !== user.id)
      return { error: "You can only edit your own SaaS." };
    existed = !!existing;
    uploaded = await uploadImage(client, user.id, form.get("image"));
    const { data, error } = await client.rpc("save_saas", {
      p_id: fields.id,
      p_name: fields.name,
      p_tagline: fields.tagline,
      p_description: fields.description,
      p_category: fields.category,
      p_website: fields.website,
      p_logo_path: uploaded || (form.has("remove_image") ? null : (existing?.logo_path ?? null)),
      p_launched_on: fields.launched_on || null,
      p_share_mrr: fields.share_mrr,
      p_share_customers: fields.share_customers,
      p_share_launch: fields.share_launch,
      p_tech_stack: fields.tech_stack,
    });
    if (error)
      throw new Error(
        // P0001 errors, such as the product limits, are written for makers by the database.
        error.code === "P0001"
          ? `${error.message}.`
          : "The SaaS profile could not be saved. Please check your fields and try again.",
      );
    savedId = data;
  } catch (error) {
    if (uploaded) await client.storage.from("profile-images").remove([uploaded]);
    return { error: message(error) };
  }
  revalidatePath("/", "layout");
  // New products continue to revenue verification; edits return to the dashboard.
  redirect(
    existed ? `/dashboard?saved=${savedId}` : `/dashboard/saas/${savedId}?created=1#revenue`,
  );
}
