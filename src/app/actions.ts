"use server";

import { RedirectType, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  changePassword,
  deleteAccount,
  deleteSignedInAccount,
  usernameLockDays,
} from "@/lib/account";
import { recordAccountSource } from "@/lib/account-source";
import { rememberAccountPreferences } from "@/lib/account-preferences";
import { wantedCurrency } from "@/lib/display-currency";
import { confirmationMethod, PROVIDER_NAMES, signedInWithin } from "@/lib/auth";
import {
  emailLink,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  profileSchema,
  safeNext,
  saasSchema,
  normalizeUsername,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  usernameSchema,
  type ActionState,
} from "@/lib/domain";
import { addressAcceptsMail } from "@/lib/email-domain";
import { sendQueuedEmails } from "@/lib/email/outbox";
import { announceProduct, announceRemovedProduct } from "@/lib/indexnow";
import { termsUpdated } from "@/lib/legal";
import { failureMessage, localizeValidation } from "@/lib/localize-validation";
import { PRODUCT_LIMIT, DAILY_PRODUCT_LIMIT } from "@/lib/moderation";
import { keepNewProduct } from "@/lib/new-product";
import { PROVIDERS } from "@/lib/revenue/catalog";
import {
  beginRevenueCheck,
  chosenProvider,
  keepConnectionResult,
  type ChosenProvider,
} from "@/lib/revenue/connect";
import { connectionResultPath, oauthConnectPath } from "@/lib/revenue/connection-result";
import { localizeRevenueText, makerMessage } from "@/lib/revenue/errors";
import { connectedSummary } from "@/lib/revenue/summary";
import { connectProvider } from "@/lib/revenue/sync";
import { siteUrl } from "@/lib/seo";
import { sendQueuedTelegramAlerts } from "@/lib/telegram/outbox";
import {
  recordSignInCountry,
  requireUser,
  serverClient,
  signupFinished,
  startPage,
} from "@/lib/supabase/server";
import { uploadImage } from "@/lib/upload";
import { issuedMessage } from "@/lib/validation";
import { getLocale, getTranslations } from "next-intl/server";
import { localePath, localeRedirect } from "@/i18n/navigation";

const value = (form: FormData, key: string) => String(form.get(key) ?? "");
// A failure an action caught, in words for the form and in the request's language.
const message = failureMessage;

// Whether the current session signed in with this method in the last `seconds`.
async function signedInRecently(
  client: Awaited<ReturnType<typeof serverClient>>,
  method: "otp" | "oauth",
  seconds: number,
) {
  const { data } = await client.auth.getClaims();
  return signedInWithin(data?.claims.amr, method, seconds);
}

// What is wrong with the email address and password.
async function detailsProblem(mode: string, email: string, password: string) {
  const t = await getTranslations("auth.actions");
  if (mode !== "update" && !z.email().safeParse(email).success) return t("invalidEmail");
  const minimum = mode === "login" ? 1 : PASSWORD_MIN_LENGTH;
  if (mode !== "reset" && (password.length < minimum || password.length > PASSWORD_MAX_LENGTH))
    return t("passwordLength", { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH });
  if (mode === "signup" && !(await addressAcceptsMail(email))) return t("undeliverable");
  return null;
}

// Why a username cannot be used by the current visitor or user, or null when it can.
async function usernameProblem(
  client: Awaited<ReturnType<typeof serverClient>>,
  input: string,
): Promise<{ username: string; problem: string | null }> {
  const parsed = usernameSchema.safeParse(input);
  if (!parsed.success) return { username: input, problem: await message(parsed.error) };
  const [{ data, error }, t] = await Promise.all([
    client.rpc("check_username", { p_username: parsed.data }),
    getTranslations("auth.username"),
  ]);
  if (error) return { username: parsed.data, problem: t("checkFailed") };
  if (!data) return { username: parsed.data, problem: null };
  return {
    username: parsed.data,
    problem:
      data === "format"
        ? t("format", { min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH })
        : t(data),
  };
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
  const problem = await detailsProblem(mode, email, password);
  if (problem) return { error: problem };
  const t = await getTranslations("auth.actions");
  // Asked for with the username, in the second step of sign-up.
  if (mode === "signup" && form.get("terms") !== "on") return { error: t("acceptTerms") };
  const client = await serverClient();
  // Both emails link to the confirm page, which verifies the token in whichever browser opens it.
  const confirm = `${siteUrl()}${await localePath("/auth/confirm")}`;
  if (mode === "signup") {
    const { username, problem: taken } = await usernameProblem(client, value(form, "username"));
    if (taken) return { error: taken };
    const { data, error } = await client.auth.signUp({
      email,
      password,
      // Triggers create the profile with the username (as name and address) and copy the
      // accepted version of the terms into private.terms_acceptances.
      // Preferences stay with the account; the language also controls emails.
      options: {
        emailRedirectTo: confirm,
        data: {
          terms_version: termsUpdated,
          username,
          locale: await getLocale(),
          currency: await wantedCurrency(),
        },
      },
    });
    if (error)
      return {
        error: t(error.code === "over_email_send_rate_limit" ? "signupLimit" : "signupFailed"),
      };
    // An address that already has an account gets a made-up user, which the database ignores.
    if (data.user) {
      await recordAccountSource(data.user.id);
      sendQueuedTelegramAlerts();
    }
    if (!data.session) return { success: t("checkEmail") };
  } else if (mode === "reset") {
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: confirm });
    if (error) return { error: t("resetFailed") };
    return { success: t("resetSent") };
  } else if (mode === "update") {
    await requireUser();
    // Only a session opened from an email link in the last 15 minutes may set a new password, so
    // a stolen session cannot take over the account. Every other session ends afterwards.
    if (!(await signedInRecently(client, "otp", 15 * 60))) return { error: t("resetExpired") };
    const { error } = await client.auth.updateUser({ password });
    if (error) return { error: t("updateFailed") };
    await client.auth.signOut({ scope: "others" });
  } else {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { error: t("signInFailed") };
    await rememberAccountPreferences(client, data.user, {
      locale: await getLocale(),
      currency: await wantedCurrency(),
    });
  }
  // A sign-up without email confirmation has signed in too.
  if (mode === "login" || mode === "signup") await recordSignInCountry(client);
  revalidatePath("/", "layout");
  // Replaces sign-in in history, so going back, or closing a dialog opened next, skips the form.
  return localeRedirect(
    (mode === "login" && safeNext(value(form, "next"))) || "/dashboard",
    RedirectType.replace,
  );
}

// Sends the sign-up confirmation again. Auth answers the same whether or not the address has an
// account waiting for confirmation, and limits how often it sends.
export async function resendConfirmationAction(email: string): Promise<ActionState> {
  const t = await getTranslations("auth.actions");
  if (!z.email().safeParse(email).success) return { error: t("invalidEmail") };
  const client = await serverClient();
  const { error } = await client.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${siteUrl()}${await localePath("/auth/confirm")}` },
  });
  if (error)
    return {
      error: t(error.code === "over_email_send_rate_limit" ? "resendLimit" : "resendFailed"),
    };
  return { success: t("resent") };
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
    p_milestones: form.has("milestones"),
  });
  const t = await getTranslations("account.actions");
  if (error) return { error: t("settingsFailed") };
  return { success: t("settingsSaved") };
}

// The confirm page submits the token from an email link. Verifying it here, on a button press
// rather than when the page loads, keeps email link scanners from using the link up.
export async function confirmEmailLinkAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const t = await getTranslations("auth.actions");
  const link = emailLink(value(form, "token_hash"), value(form, "type"));
  if (!link) return { error: t("linkIncomplete") };
  const client = await serverClient();
  const { data, error } = await client.auth.verifyOtp({
    token_hash: link.tokenHash,
    type: link.type,
  });
  if (error)
    return {
      error: t(
        link.type === "recovery"
          ? "linkExpiredRecovery"
          : link.type === "email_change"
            ? "linkExpiredEmailChange"
            : "linkExpiredSignup",
      ),
    };
  if (data.user && data.session)
    await rememberAccountPreferences(client, data.user, {
      locale: await getLocale(),
      currency: await wantedCurrency(),
    });
  if (link.type === "email_change") {
    // The first of the two addresses to confirm gets no session: the other one still has to.
    if (!data.session) return { success: t("emailChangeHalfway") };
    revalidatePath("/", "layout");
    return localeRedirect("/dashboard/settings?email=changed");
  }
  await recordSignInCountry(client);
  revalidatePath("/", "layout");
  if (link.type === "recovery") return localeRedirect("/auth?mode=update");
  return localeRedirect(data.user ? await startPage(client, data.user.id) : "/dashboard");
}

// The last step of a sign-up through Google or GitHub: the username and the Terms of Service,
// which email sign-up asks for before the account is created.
export async function finishSignupAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { user, client } = await requireUser({ unfinished: true });
  const next = safeNext(value(form, "next"));
  if (await signupFinished()) return localeRedirect(next || "/dashboard");
  const t = await getTranslations("auth");
  if (form.get("terms") !== "on") return { error: t("actions.acceptTerms") };
  const { username, problem } = await usernameProblem(client, value(form, "username"));
  if (problem) return { error: problem };
  const { error } = await client.rpc("complete_signup", {
    p_username: username,
    p_terms_version: termsUpdated,
  });
  if (error)
    return {
      error: t(error.message === "username taken" ? "username.taken" : "actions.setupFailed"),
    };
  await rememberAccountPreferences(client, user, {
    locale: await getLocale(),
    currency: await wantedCurrency(),
  });
  sendQueuedTelegramAlerts();
  revalidatePath("/", "layout");
  return localeRedirect(next || (await startPage(client, user.id)));
}

export async function signOut() {
  const client = await serverClient();
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw new Error((await getTranslations("auth.actions"))("signOutFailed"));
  revalidatePath("/", "layout");
  return localeRedirect("/");
}

// A new email address. Auth sends a link to the current address and one to the new address, and
// changes it once both are confirmed, so a stolen session alone cannot move the account.
export async function changeEmailAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const { user, client } = await requireUser();
  const t = await getTranslations("account.actions");
  const email = value(form, "email").trim();
  if (!z.email().safeParse(email).success || email.length > 254)
    return { error: t("invalidEmail") };
  if (email.toLowerCase() === user.email?.toLowerCase()) return { error: t("sameEmail") };
  if (!(await addressAcceptsMail(email))) return { error: t("undeliverable") };
  const { error } = await client.auth.updateUser(
    { email },
    { emailRedirectTo: `${siteUrl()}${await localePath("/auth/confirm")}` },
  );
  if (error)
    return {
      error: t(
        error.code === "email_exists"
          ? "emailTaken"
          : error.code === "over_email_send_rate_limit"
            ? "emailLimit"
            : "changeFailed",
      ),
    };
  return { success: t("changeSent", { current: user.email ?? "", email }) };
}

// A new password, once the current one is checked. Auth ends every other session when it changes,
// so a device signed in with the old password has to sign in again; this browser carries on with
// the session that made the change.
export async function changePasswordAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { user, client } = await requireUser();
  const t = await getTranslations("account.actions");
  if (confirmationMethod(user) !== "password" || !user.email) return { error: t("noPassword") };
  const current = value(form, "current_password");
  const password = value(form, "password");
  if (!current || current.length > PASSWORD_MAX_LENGTH) return { error: t("enterCurrent") };
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH)
    return {
      error: t("newPasswordLength", { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }),
    };
  try {
    const session = await changePassword(user.id, user.email, current, password);
    const { error } = await client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (error) throw new Error(t("signInAgain"));
  } catch (error) {
    return { error: await message(error) };
  }
  return { success: t("passwordChanged") };
}

// A link to choose a password by email, for an account that signs in with Google or GitHub, or
// for a user who does not remember theirs.
export async function sendPasswordLinkAction(): Promise<ActionState> {
  const { user, client } = await requireUser();
  const t = await getTranslations("account.actions");
  if (!user.email) return { error: t("noEmail") };
  const { error } = await client.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${siteUrl()}${await localePath("/auth/confirm")}`,
  });
  if (error)
    return {
      error: t(error.code === "over_email_send_rate_limit" ? "emailLimit" : "linkFailed"),
    };
  return { success: t("linkSent", { email: user.email }) };
}

export async function deleteAccountAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { user, client } = await requireUser({ unfinished: true });
  const method = confirmationMethod(user);
  const t = await getTranslations("account");
  try {
    if (method !== "password") {
      // The database checks the same five minutes.
      if (!(await signedInRecently(client, "oauth", 5 * 60)))
        return { error: t("actions.confirmAgain", { provider: PROVIDER_NAMES[method] }) };
      await deleteSignedInAccount(client, user.id);
    } else {
      const password = value(form, "password");
      if (!password || password.length > 128) return { error: t("actions.enterPassword") };
      if (!user.email) return { error: t("errors.deleteFailed") };
      await deleteAccount(user.id, user.email, password);
    }
  } catch (error) {
    return { error: await message(error) };
  }
  // The account no longer exists, so this only clears the session cookies in this browser.
  await client.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  return localeRedirect("/account-deleted", RedirectType.replace);
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
    throw new Error((await getTranslations("saasForm.delete"))("failed"));
  return profile.data?.avatar_path !== path && !products.count;
}

export async function deleteSaasAction(
  saasId: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const [{ user, client }, t] = await Promise.all([
    requireUser(),
    getTranslations("saasForm.delete"),
  ]);
  if (!z.uuid().safeParse(saasId).success) return { error: t("notOwner") };
  const { data: saas, error } = await client
    .from("saas")
    .select("name, logo_path, slug")
    .eq("id", saasId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) return { error: t("loadFailed") };
  if (!saas) return { error: t("notOwner") };
  if (value(form, "confirm_name").trim() !== saas.name.trim()) return { error: t("confirmName") };
  try {
    // The logo goes first, so a failure leaves the product in place to delete again.
    if (saas.logo_path && (await logoIsUnused(client, user.id, saas.logo_path, saasId))) {
      const { error: removeError } = await client.storage
        .from("profile-images")
        .remove([saas.logo_path]);
      if (removeError) throw new Error(t("logoFailed"));
    }
    // Foreign keys remove the settings, figures, provider connection and verification history.
    const { data: deleted, error: deleteError } = await client
      .from("saas")
      .delete()
      .eq("id", saasId)
      .eq("owner_id", user.id)
      .select("id");
    if (deleteError || !deleted.length) throw new Error(t("failed"));
  } catch (error) {
    return { error: await message(error) };
  }
  announceRemovedProduct(saas.slug);
  revalidatePath("/", "layout");
  return localeRedirect("/dashboard?deleted=1", RedirectType.replace);
}

export async function saveProfile(_state: ActionState, form: FormData): Promise<ActionState> {
  const { user, client } = await requireUser();
  const t = await getTranslations("account.actions");
  const uploaded: string[] = [];
  let unsaved: string | null = null;
  try {
    const fields = profileSchema.parse(
      Object.fromEntries(
        [
          "name",
          "headline",
          "location",
          "website",
          "linkedin_url",
          "github_url",
          "x_url",
          "social_url",
        ].map((key) => [key, value(form, key)]),
      ),
    );
    const { data: existing, error: readError } = await client
      .from("profiles")
      .select("avatar_path, slug")
      .eq("id", user.id)
      .maybeSingle();
    if (readError) return { error: t("profileLoadFailed") };
    // Only a changed username is checked, so an older, longer address can stay as it is.
    let username = normalizeUsername(value(form, "username"));
    if (username !== existing?.slug) {
      const { data: availableAt, error: lockError } = await client.rpc(
        "username_change_available_at",
      );
      if (lockError) return { error: t("profileLoadFailed") };
      if (availableAt)
        return { error: t("usernameLocked", { days: usernameLockDays(availableAt) }) };
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
      p_website: fields.website,
      p_linkedin_url: fields.linkedin_url,
      p_github_url: fields.github_url,
      p_x_url: fields.x_url,
      p_social_url: fields.social_url,
      p_avatar_path: avatar || (form.has("remove_image") ? null : (existing?.avatar_path ?? null)),
    });
    if (error) throw new Error(t("profileSaveFailed"));
    // Checked above, so this fails only when someone took the username in the meantime.
    if (username !== existing?.slug) {
      const { error: usernameError } = await client.rpc("set_username", { p_username: username });
      if (usernameError)
        unsaved = t(
          usernameError.message.includes("taken")
            ? "usernameJustTaken"
            : usernameError.message.includes("locked")
              ? "usernameJustChanged"
              : "usernameFailed",
        );
    }
  } catch (error) {
    if (uploaded.length) await client.storage.from("profile-images").remove(uploaded);
    return { error: await message(error) };
  }
  revalidatePath("/", "layout");
  return unsaved ? { error: unsaved } : { success: t("profileSaved") };
}

export type SaveSaasState = ActionState & {
  /** Where the browser goes next when the action cannot redirect there itself. */
  location?: string;
  /** Why the chosen payment provider was not connected, shown at the revenue section. */
  connectionError?: string;
};

// What save_saas and the product limits say, by their English words, as saasForm.save messages.
const SAVE_PROBLEMS: Partial<Record<string, "usernameFirst" | "productLimit" | "dailyLimit">> = {
  "Choose a username first": "usernameFirst",
  "An account can list up to 20 products": "productLimit",
  "You can add up to 5 products a day. Try again tomorrow": "dailyLimit",
};

// Saves a product, and connects the payment provider chosen in the same form. Every product names
// its provider: a supported one to connect, or another one under Other, kept with the settings;
// only a product that is connected already may leave the choice empty. A key is verified with the
// provider after the product is saved, so a product is never lost to a key the provider refuses.
// The editor shows how connecting went: a new product's editor through a cookie, and an existing
// product's editor on the spot when it failed, with the form as it was.
export async function saveSaas(_state: SaveSaasState, form: FormData): Promise<SaveSaasState> {
  const [{ user, client }, t] = await Promise.all([requireUser(), getTranslations("saasForm")]);
  let choice: ChosenProvider | null;
  try {
    choice = chosenProvider(form);
  } catch (error) {
    // The name written under Other is checked like a field; anything else is the provider's.
    const text = makerMessage(error);
    return {
      connectionError: issuedMessage(text)
        ? await localizeValidation(text)
        : await localizeRevenueText(text),
    };
  }
  const chosen = choice?.provider === "other" ? null : choice;
  let uploaded: string | null = null;
  let savedId: string;
  let existed: boolean;
  let previousSlug: string | null;
  try {
    const fields = saasSchema.parse({
      ...Object.fromEntries(
        ["id", "name", "tagline", "description", "category", "website", "launched_on"].map(
          (key) => [key, value(form, key)],
        ),
      ),
      // Figures are shared unless their box asks to hide them.
      share_revenue: !form.has("hide_revenue"),
      share_customers: !form.has("hide_customers"),
      share_launch: !form.has("hide_launch"),
      // One entry per ticked technology.
      tech_stack: form.getAll("tech").map(String),
    });
    const { data: existing, error: readError } = await client
      .from("saas")
      .select("owner_id, logo_path, slug")
      .eq("id", fields.id)
      .maybeSingle();
    if (readError) return { error: t("save.loadFailed") };
    if (existing && existing.owner_id !== user.id) return { error: t("save.notOwner") };
    existed = !!existing;
    previousSlug = existing?.slug ?? null;
    if (!choice) {
      const { count, error: connectionError } = await client
        .from("revenue_connections")
        .select("saas_id", { count: "exact", head: true })
        .eq("saas_id", fields.id);
      if (connectionError) return { error: t("save.loadFailed") };
      if (!count) return { connectionError: t("chooseProvider") };
    }
    uploaded = await uploadImage(client, user.id, form.get("image"));
    const { data, error } = await client.rpc("save_saas", {
      p_id: fields.id,
      p_name: fields.name,
      p_tagline: fields.tagline,
      p_description: fields.description,
      p_category: fields.category,
      p_website: fields.website,
      p_logo_path: uploaded || (form.has("remove_image") ? null : (existing?.logo_path ?? null)),
      p_launched_on: fields.launched_on,
      p_share_revenue: fields.share_revenue,
      p_share_customers: fields.share_customers,
      p_share_launch: fields.share_launch,
      p_tech_stack: fields.tech_stack,
      // Null clears a name saved before.
      p_other_provider: choice?.provider === "other" ? choice.name : null,
      // For a new product's Telegram alert.
      p_provider: choice?.provider ?? null,
    });
    if (error) {
      // P0001 errors, such as the product limits, are written for makers by the database.
      const problem = error.code === "P0001" ? SAVE_PROBLEMS[error.message] : undefined;
      throw new Error(
        problem
          ? t(`save.${problem}`, {
              limit: problem === "dailyLimit" ? DAILY_PRODUCT_LIMIT : PRODUCT_LIMIT,
            })
          : error.code === "P0001"
            ? `${error.message}.`
            : t("save.failed"),
      );
    }
    savedId = data;
  } catch (error) {
    if (uploaded) await client.storage.from("profile-images").remove([uploaded]);
    return { error: await message(error) };
  }
  // Search engines that take IndexNow notices hear about the page at once.
  announceProduct(client, savedId, previousSlug);
  if (!existed) {
    sendQueuedTelegramAlerts();
    // Wherever saving leads, the founder is offered to share the new product once.
    await keepNewProduct(savedId);
  }
  let connectionError: string | null = null;
  if (chosen?.key) {
    const { name } = PROVIDERS[chosen.provider];
    try {
      await beginRevenueCheck(client, savedId, false);
      const result = await connectProvider(savedId, chosen.provider, chosen.key);
      await keepConnectionResult({
        saasId: savedId,
        provider: chosen.provider,
        tone: "success",
        text: await connectedSummary(result),
      });
    } catch (error) {
      unstable_rethrow(error);
      connectionError = t(existed ? "save.savedNotConnected" : "save.addedNotConnected", {
        provider: name,
        reason: await localizeRevenueText(makerMessage(error)),
      });
      if (!existed)
        await keepConnectionResult({
          saasId: savedId,
          provider: chosen.provider,
          tone: "error",
          text: connectionError,
        });
    }
  }
  // Sharing MRR or a verification can reach a milestone, whose email goes out now rather than on
  // the next run.
  sendQueuedEmails();
  revalidatePath("/", "layout");
  // Approving access through OAuth starts with a plain navigation, which the browser makes.
  if (chosen && !chosen.key)
    return { location: oauthConnectPath(chosen.provider, savedId, await getLocale()) };
  // An existing product's editor keeps the form, so the key or the site can be corrected there.
  if (existed && connectionError) return { connectionError };
  // A connection shows its result in the editor; anything else returns to the dashboard.
  return localeRedirect(
    chosen
      ? connectionResultPath(savedId)
      : existed
        ? `/dashboard?saved=${savedId}`
        : `/dashboard?added=${savedId}`,
  );
}
