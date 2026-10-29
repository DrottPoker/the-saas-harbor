"use client";

import {
  cloneElement,
  isValidElement,
  startTransition,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useEditorAction } from "./use-editor-action";
import { useFormStatus } from "react-dom";
import Link from "@/components/link";
import { MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  authenticate,
  checkSignupDetails,
  confirmEmailLinkAction,
  finishSignupAction,
  resendConfirmationAction,
  saveEmailSettingsAction,
} from "@/app/actions";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  usernameAsTyped,
  type ActionState,
  type EmailLinkType,
} from "@/lib/domain";
import { oauthStartPath, PROVIDER_NAMES, type OAuthProvider } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { PersonAvatar, ProductLogo } from "./avatars";
import { ProviderButton } from "./provider-button";
import { Notice } from "./shell";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

function useBlockText() {
  return useTranslations("common.forms");
}

export function Submit({
  className,
  variant,
  size,
  pendingLabel,
  pending: busy,
  children,
}: {
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  pendingLabel?: string;
  /** For forms submitted from onSubmit, which useFormStatus cannot see. */
  pending?: boolean;
  children: React.ReactNode;
}) {
  const text = useBlockText();
  const status = useFormStatus();
  const pending = busy ?? status.pending;
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending} className={className}>
      {pending ? (pendingLabel ?? text("saving")) : children}
    </Button>
  );
}
export function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.success) return <Notice tone="success">{state.success}</Notice>;
  return null;
}
/** The red star is for sighted users; the field's own `required` tells screen readers. */
export function Field({
  name,
  label,
  hint,
  aside,
  required = false,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  aside?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  // The hint is read out with the field: the field's one control points at it.
  const hintId = hint ? `${name}-hint` : undefined;
  const control =
    hintId && isValidElement<{ "aria-describedby"?: string }>(children)
      ? cloneElement(children, {
          "aria-describedby": [children.props["aria-describedby"], hintId]
            .filter(Boolean)
            .join(" "),
        })
      : children;
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        {/* The star stays outside the label, so the field's name is exactly the label. */}
        <span className="flex items-baseline gap-0.5">
          <Label htmlFor={name}>{label}</Label>
          {required && (
            <span aria-hidden="true" className="text-sm leading-none font-medium text-destructive">
              *
            </span>
          )}
        </span>
        {aside}
      </div>
      {control}
      {hint && (
        <p id={hintId} className="text-[13px] text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
export function Share({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked: boolean | undefined;
}) {
  return (
    <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
      <input name={name} type="checkbox" defaultChecked={checked} className="size-4 accent-brand" />
      {label}
    </label>
  );
}
// Settings-style section: title and explanation on the left, fields on the right.
export function Section({
  id,
  title,
  description,
  children,
}: {
  /** An anchor, such as the one a redirect scrolls to. */
  id?: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="grid scroll-mt-6 gap-5 border-t py-8 first-of-type:border-t-0 first-of-type:pt-0 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10"
    >
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-5">{children}</div>
    </section>
  );
}
export function ImageField({
  label,
  current,
  name,
  person,
}: {
  label: string;
  current: string | null | undefined;
  name: string;
  person?: boolean;
}) {
  const text = useBlockText();
  const Preview = person ? PersonAvatar : ProductLogo;
  return (
    <div className="flex items-start gap-4">
      <Preview path={current} name={name || "?"} size="lg" />
      <div className="grid flex-1 gap-3">
        <Field name="image" label={label} hint={text("imageHint")}>
          <Input name="image" id="image" type="file" accept="image/png,image/jpeg,image/webp" />
        </Field>
        {current && <Share name="remove_image" label={text("removeImage")} checked={false} />}
      </div>
    </div>
  );
}
/** A form's buttons. `sticky` keeps them at the bottom of the screen while the form is in view. */
export function Actions({
  sticky = false,
  children,
}: {
  sticky?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 border-t pt-6",
        sticky && "sticky bottom-0 z-10 -mx-4 bg-background px-4 pb-4 pt-4 sm:-mx-6 sm:px-6",
      )}
    >
      {children}
    </div>
  );
}

/** A username field, with the @ in front of it. */
export function UsernameInput(props: Omit<React.ComponentProps<typeof Input>, "type">) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted-foreground"
      >
        @
      </span>
      <Input
        id="username"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        minLength={USERNAME_MIN_LENGTH}
        // One more for an @ typed in front, which the server removes.
        maxLength={USERNAME_MAX_LENGTH + 1}
        {...props}
        // "New Founder" becomes new-founder as it is typed, as the server would store it.
        onChange={(event) => {
          const typed = usernameAsTyped(event.currentTarget.value);
          if (typed !== event.currentTarget.value) event.currentTarget.value = typed;
          props.onChange?.(event);
        }}
        // Read-only while a recent change locks it, and it looks it.
        className={cn(
          "ps-7 read-only:cursor-not-allowed read-only:bg-subtle read-only:text-muted-foreground",
          props.className,
        )}
      />
    </div>
  );
}

/** The Terms of Service box of a sign-up. The server checks it again and records the version. */
function TermsCheckbox({ defaultChecked }: { defaultChecked: boolean }) {
  const t = useTranslations("auth.form");
  const legal = (href: string) => (chunks: React.ReactNode) => (
    <Link
      className="font-medium text-foreground underline"
      href={href}
      target="_blank"
      rel="noopener"
    >
      {chunks}
    </Link>
  );
  return (
    <div className="flex items-start gap-3">
      <input
        id="terms"
        name="terms"
        type="checkbox"
        required
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 shrink-0 accent-brand"
      />
      <label htmlFor="terms" className="text-[13px] leading-5 text-muted-foreground">
        {t.rich("terms", { terms: legal("/terms"), privacy: legal("/privacy") })}
      </label>
    </div>
  );
}

// Seconds before the confirmation can be sent again, as Auth allows one email a minute.
const RESEND_WAIT = 60;

/**
 * Sends the confirmation email again. Auth sends one a minute, so it waits a minute after sign-up,
 * which just sent one, and after each email it sends.
 */
function ResendConfirmation({ email }: { email: string }) {
  const t = useTranslations("auth.sent");
  const [result, setResult] = useState<ActionState>({});
  const [wait, setWait] = useState(RESEND_WAIT);
  const [sending, startSending] = useTransition();
  useEffect(() => {
    if (!wait) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);
  return (
    <div className="grid gap-3">
      <Feedback state={result} />
      <Button
        type="button"
        variant="ghost"
        className="h-10 w-full"
        disabled={sending || wait > 0}
        onClick={() =>
          startSending(async () => {
            const sent = await resendConfirmationAction(email);
            setResult(sent);
            if (sent.success) setWait(RESEND_WAIT);
          })
        }
      >
        {sending ? t("sending") : wait > 0 ? t("resendIn", { seconds: wait }) : t("resend")}
      </Button>
    </div>
  );
}

const usernameLimits = { min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH };

// Sign-up has two steps: the email address and password, which the server checks first, then the
// username and the Terms of Service, after which the account is created. Both steps stay in one form, so the
// hidden first step is sent along with the username; it is submitted from onSubmit rather than
// the action prop, so React does not reset the password when the username is refused.
export function AuthForm({
  mode,
  next,
  providers = [],
}: {
  mode: "login" | "signup" | "reset" | "update";
  /** Where to continue after signing in, already checked with safeNext(). */
  next?: string | null;
  /** The sign-in providers Supabase Auth offers, such as Google and GitHub. */
  providers?: OAuthProvider[];
}) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [state, action, creating] = useEditorAction(authenticate.bind(null, mode));
  const signup = mode === "signup";
  const [step, setStep] = useState<"details" | "username">("details");
  const [details, setDetails] = useState<ActionState>({});
  const [checking, startChecking] = useTransition();
  const username = useRef<HTMLInputElement>(null);
  const choosing = signup && step === "username";
  useEffect(() => {
    if (choosing) username.current?.focus();
  }, [choosing]);

  const sent = signup && !!state.success;
  const sentHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (sent) sentHeading.current?.focus();
  }, [sent]);
  // Switching between the forms keeps where sign-in continues.
  const continuing = next ? `next=${encodeURIComponent(next)}` : "";
  const authHref = (form?: "signup" | "reset") => {
    const query = [form && `mode=${form}`, continuing].filter(Boolean).join("&");
    return query ? `/auth?${query}` : "/auth";
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!choosing)
      startChecking(async () => {
        const result = await checkSignupDetails({}, data);
        // Only a refusal is shown; passing the first step simply opens the second.
        setDetails(result.success ? {} : result);
        if (result.success) setStep("username");
      });
    else startTransition(() => action(data));
  };

  // Once the account is created, the form gives way to what to do next.
  if (sent)
    return (
      <section
        aria-labelledby="sent-title"
        className="grid gap-4 rounded-xl border bg-surface p-6 shadow-card"
      >
        <MailCheck aria-hidden="true" className="size-8 text-brand" />
        <h2
          id="sent-title"
          ref={sentHeading}
          tabIndex={-1}
          className="text-xl font-semibold tracking-tight focus:outline-none"
        >
          {t("sent.title")}
        </h2>
        <p className="leading-7 text-muted-foreground">
          {t.rich("sent.body", {
            email: () => (
              <strong className="font-medium text-foreground [overflow-wrap:anywhere]">
                {state.values?.email}
              </strong>
            ),
          })}
        </p>
        <p className="text-[13px] leading-5 text-muted-foreground">{t("sent.help")}</p>
        <ResendConfirmation email={state.values?.email ?? ""} />
        <Button asChild variant="outline" className="h-10 w-full">
          <Link href={authHref()} replace>
            {t("sent.goToSignIn")}
          </Link>
        </Button>
      </section>
    );

  const withProviders = providers.length > 0 && (mode === "login" || (signup && !choosing));
  const quietLink = (href: string) => (chunks: React.ReactNode) => (
    <Link className="font-medium text-foreground hover:underline" href={href} replace>
      {chunks}
    </Link>
  );
  return (
    <div className="grid gap-5">
      {withProviders && (
        <>
          <div className="grid gap-3">
            {providers.map((provider) => (
              <ProviderButton
                key={provider}
                provider={provider}
                href={oauthStartPath(provider, { next, locale })}
              >
                {t("form.continueWith", { provider: PROVIDER_NAMES[provider] })}
              </ProviderButton>
            ))}
          </div>
          <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("form.orWithEmail")}
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      <form
        action={signup ? undefined : action}
        onSubmit={signup ? submit : undefined}
        className="grid gap-5"
      >
        {mode === "login" && next && <input type="hidden" name="next" value={next} />}
        {choosing && (
          <>
            <Field
              name="username"
              label={t("form.username")}
              hint={t("form.usernameHint", usernameLimits)}
            >
              <UsernameInput ref={username} defaultValue={state.values?.username} />
            </Field>
            {/* A refused username is the usual problem here, so it shows by the field. */}
            <Feedback state={state} />
            {/* Required here and checked again by the server, which records the version. */}
            <TermsCheckbox defaultChecked={state.values?.terms === "on"} />
          </>
        )}
        <div className={cn("grid gap-5", choosing && "hidden")}>
          {mode !== "update" && (
            <Field name="email" label={t("form.email")}>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={state.values?.email}
                required
                maxLength={254}
              />
            </Field>
          )}
          {mode !== "reset" && (
            <Field
              name="password"
              label={mode === "update" ? t("form.newPassword") : t("form.password")}
              hint={
                mode === "signup" || mode === "update"
                  ? t("form.passwordHint", { min: PASSWORD_MIN_LENGTH })
                  : undefined
              }
              aside={
                mode === "login" && (
                  // No taller than the label, so the field sits where it does on the other forms;
                  // the padding keeps the link easy to tap.
                  <Link
                    className="-my-1.5 py-1.5 text-[13px] leading-none text-muted-foreground hover:text-foreground"
                    href={authHref("reset")}
                    replace
                  >
                    {t("form.forgotPassword")}
                  </Link>
                )
              }
            >
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "login" ? 1 : PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                required
              />
            </Field>
          )}
        </div>
        {!choosing && <Feedback state={signup ? details : state} />}
        <Submit
          className="h-10 w-full"
          pending={signup ? checking || creating : undefined}
          pendingLabel={t("form.saving")}
        >
          {signup && !choosing ? t("form.continue") : t(`form.submit.${mode}`)}
        </Submit>
        <p className="text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            t.rich("form.noAccount", { link: quietLink(authHref("signup")) })
          ) : signup && !choosing ? (
            t.rich("form.haveAccount", { link: quietLink(authHref()) })
          ) : choosing ? (
            <button
              type="button"
              className="font-medium text-foreground hover:underline"
              onClick={() => setStep("details")}
            >
              {t("form.back")}
            </button>
          ) : (
            <Link className="font-medium text-foreground hover:underline" href={authHref()} replace>
              {t("form.backToSignIn")}
            </Link>
          )}
        </p>
      </form>
    </div>
  );
}

function Setting({
  name,
  label,
  hint,
  checked,
}: {
  name: string;
  label: string;
  hint: string;
  checked: boolean;
}) {
  return (
    <label className="flex items-start gap-3">
      {/* Named by the label alone; the hint describes it. */}
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        aria-labelledby={`${name}-label`}
        aria-describedby={`${name}-hint`}
        className="mt-1 size-4 shrink-0 accent-brand"
      />
      <span>
        <span id={`${name}-label`} className="block text-sm font-medium">
          {label}
        </span>
        <span id={`${name}-hint`} className="block text-[13px] text-muted-foreground">
          {hint}
        </span>
      </span>
    </label>
  );
}

/** Which notification emails a maker gets. The report setting is for admins only. */
export function EmailSettingsForm({
  messages,
  reports,
  milestones,
  admin,
}: {
  messages: boolean;
  reports: boolean;
  milestones: boolean;
  admin: boolean;
}) {
  const t = useTranslations("account.notifications");
  const [state, action] = useEditorAction(saveEmailSettingsAction);
  const checked = (key: string, saved: boolean) =>
    state.values ? state.values[key] === "on" : saved;
  return (
    <form action={action} className="grid gap-5">
      <fieldset className="grid gap-4">
        <legend className="sr-only">{t("legend")}</legend>
        <Setting
          name="messages"
          label={t("messages")}
          hint={t("messagesHint")}
          checked={checked("messages", messages)}
        />
        <Setting
          name="milestones"
          label={t("milestones")}
          hint={t("milestonesHint")}
          checked={checked("milestones", milestones)}
        />
        {admin && (
          <>
            <input type="hidden" name="reports_shown" value="1" />
            <Setting
              name="reports"
              label={t("reports")}
              hint={t("reportsHint")}
              checked={checked("reports", reports)}
            />
          </>
        )}
      </fieldset>
      <Feedback state={state} />
      <div>
        <Submit pendingLabel={t("saving")}>{t("submit")}</Submit>
      </div>
    </form>
  );
}

/** The button on the confirm page that verifies an email link. */
export function ConfirmLinkForm({
  tokenHash,
  type,
  submit,
}: {
  tokenHash: string;
  type: EmailLinkType;
  submit: string;
}) {
  const t = useTranslations("auth.confirm");
  const [state, action] = useEditorAction(confirmEmailLinkAction);
  const back = {
    email: { href: "/auth", label: t("backToSignIn") },
    recovery: { href: "/auth?mode=reset", label: t("requestReset") },
    email_change: { href: "/dashboard/settings", label: t("backToSettings") },
  }[type];
  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <Feedback state={state} />
      {/* Once one address of an email change is confirmed, its link is used up. */}
      {!state.success && (
        <Submit className="h-10 w-full" pendingLabel={t("checking")}>
          {submit}
        </Submit>
      )}
      <p className="text-center text-sm text-muted-foreground">
        <Link className="font-medium text-foreground hover:underline" href={back.href}>
          {back.label}
        </Link>
      </p>
    </form>
  );
}

/** The last step of a sign-up through Google or GitHub: a username and the Terms of Service. */
export function FinishSignupForm({ next }: { next?: string | null }) {
  const t = useTranslations("auth");
  const [state, action] = useEditorAction(finishSignupAction);
  return (
    <form action={action} className="grid gap-5">
      {next && <input type="hidden" name="next" value={next} />}
      <Field
        name="username"
        label={t("form.username")}
        hint={t("form.usernameHint", usernameLimits)}
      >
        <UsernameInput defaultValue={state.values?.username} autoFocus />
      </Field>
      <TermsCheckbox defaultChecked={state.values?.terms === "on"} />
      <Feedback state={state} />
      <Submit className="h-10 w-full" pendingLabel={t("finish.creating")}>
        {t("finish.submit")}
      </Submit>
    </form>
  );
}
