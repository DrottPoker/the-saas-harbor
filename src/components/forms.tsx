"use client";

import { startTransition, useEffect, useRef, useState, useTransition } from "react";
import { useEditorAction } from "./use-editor-action";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import {
  authenticate,
  checkSignupDetails,
  confirmEmailLinkAction,
  saveEmailSettingsAction,
  saveSaas,
} from "@/app/actions";
import {
  categories,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  type ActionState,
} from "@/lib/domain";
import type { Saas, SaasSettings } from "@/lib/data";
import { cn } from "@/lib/utils";
import { PersonAvatar, ProductLogo } from "./avatars";
import { Notice } from "./shell";
import { Button } from "./ui/button";
import { Input, fieldClasses } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";

export function Submit({
  className,
  variant,
  size,
  pendingLabel = "Saving...",
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
  const status = useFormStatus();
  const pending = busy ?? status.pending;
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending} className={className}>
      {pending ? pendingLabel : children}
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
      {children}
      {hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
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
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-5 border-t py-8 first-of-type:border-t-0 first-of-type:pt-0 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10">
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
  const Preview = person ? PersonAvatar : ProductLogo;
  return (
    <div className="flex items-start gap-4">
      <Preview path={current} name={name || "?"} size="lg" />
      <div className="grid flex-1 gap-3">
        <Field name="image" label={label} hint="PNG, JPEG or WebP, up to 2 MB. Images are public.">
          <Input name="image" id="image" type="file" accept="image/png,image/jpeg,image/webp" />
        </Field>
        {current && <Share name="remove_image" label="Remove current image" checked={false} />}
      </div>
    </div>
  );
}
export function Actions({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-end gap-2 border-t pt-6">{children}</div>;
}

/** A username field, with the @ in front of it. */
export function UsernameInput(props: Omit<React.ComponentProps<typeof Input>, "type">) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground"
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
        // Read-only while a recent change locks it, and it looks it.
        className={cn(
          "pl-7 read-only:cursor-not-allowed read-only:bg-subtle read-only:text-muted-foreground",
          props.className,
        )}
      />
    </div>
  );
}

const authCopy = {
  login: "Sign in",
  signup: "Create account",
  reset: "Send reset link",
  update: "Update password",
} as const;

const USERNAME_HINT =
  "Shown as @username and used as your profile address. You can change it later.";

// Sign-up has two steps: the email address, password and terms, which the server checks first,
// then only the username, after which the account is created. Both steps stay in one form, so the
// hidden first step is sent along with the username; it is submitted from onSubmit rather than
// the action prop, so React does not reset the password when the username is refused.
export function AuthForm({
  mode,
  next,
}: {
  mode: "login" | "signup" | "reset" | "update";
  /** Where to continue after signing in, already checked with safeNext(). */
  next?: string | null;
}) {
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

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!choosing)
      startChecking(async () => {
        const result = await checkSignupDetails({}, data);
        setDetails(result);
        if (result.success) setStep("username");
      });
    else startTransition(() => action(data));
  };

  // Once the account is created, the form gives way to what to do next.
  if (sent)
    return (
      <section aria-labelledby="sent-title" className="grid gap-4 rounded-xl border bg-surface p-6">
        <MailCheck aria-hidden="true" className="size-8 text-brand" />
        <h2
          id="sent-title"
          ref={sentHeading}
          tabIndex={-1}
          className="text-xl font-semibold tracking-tight focus:outline-none"
        >
          Check your inbox
        </h2>
        <p className="leading-7 text-muted-foreground">
          We sent a confirmation link to{" "}
          <strong className="font-medium text-foreground [overflow-wrap:anywhere]">
            {state.values?.email}
          </strong>
          . Open it to confirm your account and add your product.
        </p>
        <p className="text-[13px] leading-5 text-muted-foreground">
          Nothing after a few minutes? Look in your spam folder, or sign up again if the address was
          wrong.
        </p>
        <Button asChild variant="outline" className="h-10 w-full">
          <Link href="/auth">Go to sign in</Link>
        </Button>
      </section>
    );

  return (
    <form
      action={signup ? undefined : action}
      onSubmit={signup ? submit : undefined}
      className="grid gap-5"
    >
      {mode === "login" && next && <input type="hidden" name="next" value={next} />}
      {choosing && (
        <Field name="username" label="Username" hint={USERNAME_HINT}>
          <UsernameInput ref={username} defaultValue={state.values?.username} />
        </Field>
      )}
      <div className={cn("grid gap-5", choosing && "hidden")}>
        {mode !== "update" && (
          <Field name="email" label="Email address">
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
            label={mode === "update" ? "New password" : "Password"}
            hint={
              mode === "signup" || mode === "update"
                ? `At least ${PASSWORD_MIN_LENGTH} characters.`
                : undefined
            }
            aside={
              mode === "login" && (
                // No taller than the label, so the field sits where it does on the other forms;
                // the padding keeps the link easy to tap.
                <Link
                  className="-my-1.5 py-1.5 text-[13px] leading-none text-muted-foreground hover:text-foreground"
                  href="/auth?mode=reset"
                >
                  Forgot password?
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
        {signup && (
          // Required here and checked again by the server, which records the accepted version.
          <div className="flex items-start gap-3">
            <input
              id="terms"
              name="terms"
              type="checkbox"
              required
              defaultChecked={state.values?.terms === "on"}
              className="mt-0.5 size-4 shrink-0 accent-brand"
            />
            <label htmlFor="terms" className="text-[13px] leading-5 text-muted-foreground">
              I agree to the{" "}
              <Link
                className="font-medium text-foreground underline"
                href="/terms"
                target="_blank"
                rel="noopener"
              >
                Terms of Service
              </Link>
              . I have read the{" "}
              <Link
                className="font-medium text-foreground underline"
                href="/privacy"
                target="_blank"
                rel="noopener"
              >
                Privacy Policy
              </Link>
              .
            </label>
          </div>
        )}
      </div>
      <Feedback state={signup && !choosing ? details : state} />
      <Submit className="h-10 w-full" pending={signup ? checking || creating : undefined}>
        {choosing ? "Continue" : authCopy[mode]}
      </Submit>
      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            No account yet?{" "}
            <Link className="font-medium text-foreground hover:underline" href="/auth?mode=signup">
              Create one
            </Link>
          </>
        ) : signup && !choosing ? (
          <>
            Already have an account?{" "}
            <Link className="font-medium text-foreground hover:underline" href="/auth">
              Sign in
            </Link>
          </>
        ) : choosing ? (
          <button
            type="button"
            className="font-medium text-foreground hover:underline"
            onClick={() => setStep("details")}
          >
            Back
          </button>
        ) : (
          <Link className="font-medium text-foreground hover:underline" href="/auth">
            Back to sign in
          </Link>
        )}
      </p>
    </form>
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
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        className="mt-1 size-4 shrink-0 accent-brand"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-[13px] text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

/** Which notification emails a maker gets. The report setting is for admins only. */
export function EmailSettingsForm({
  messages,
  reports,
  admin,
}: {
  messages: boolean;
  reports: boolean;
  admin: boolean;
}) {
  const [state, action] = useEditorAction(saveEmailSettingsAction);
  const checked = (key: string, saved: boolean) =>
    state.values ? state.values[key] === "on" : saved;
  return (
    <form action={action} className="grid gap-5">
      <fieldset className="grid gap-4">
        <legend className="sr-only">Emails you get</legend>
        <Setting
          name="messages"
          label="New messages from other users"
          hint="One email per conversation, only when a message is still unread after a few minutes. It never contains the message."
          checked={checked("messages", messages)}
        />
        {admin && (
          <>
            <input type="hidden" name="reports_shown" value="1" />
            <Setting
              name="reports"
              label="New reports waiting for review"
              hint="For admins. At most one email an hour."
              checked={checked("reports", reports)}
            />
          </>
        )}
      </fieldset>
      <Feedback state={state} />
      <div>
        <Submit>Save settings</Submit>
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
  type: "email" | "recovery";
  submit: string;
}) {
  const [state, action] = useEditorAction(confirmEmailLinkAction);
  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <Feedback state={state} />
      <Submit className="h-10 w-full" pendingLabel="Checking the link...">
        {submit}
      </Submit>
      <p className="text-center text-sm text-muted-foreground">
        <Link
          className="font-medium text-foreground hover:underline"
          href={type === "recovery" ? "/auth?mode=reset" : "/auth"}
        >
          {type === "recovery" ? "Request a new reset link" : "Back to sign in"}
        </Link>
      </p>
    </form>
  );
}

export function SaasForm({
  id,
  saas,
  settings,
}: {
  id: string;
  saas?: Saas;
  settings?: SaasSettings | null;
}) {
  const [state, action] = useEditorAction(saveSaas);
  const shared = (key: "share_mrr" | "share_customers" | "share_launch") =>
    state.values ? !!state.values[key] : settings?.[key];
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Section
        title="Product"
        description="Shown on the public product page and in listings. Fields marked * are required."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="name" label="Product name" required>
            <Input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={80}
              defaultValue={state.values?.name ?? saas?.name}
            />
          </Field>
          <Field name="category" label="Category">
            {/* React resets the form after the action but not a select's default, so the select
                is mounted again with the value that was sent. */}
            <select
              key={state.values?.category ?? saas?.category ?? "Productivity"}
              id="category"
              name="category"
              defaultValue={state.values?.category ?? saas?.category ?? "Productivity"}
              className={cn(fieldClasses, "h-10")}
            >
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field name="tagline" label="Tagline" hint="One sentence, up to 140 characters." required>
          <Input
            id="tagline"
            name="tagline"
            required
            minLength={5}
            maxLength={140}
            defaultValue={state.values?.tagline ?? saas?.tagline}
            placeholder="What does it help people do?"
          />
        </Field>
        <Field name="description" label="Description" required>
          <Textarea
            id="description"
            name="description"
            required
            minLength={20}
            maxLength={5000}
            rows={6}
            defaultValue={state.values?.description ?? saas?.description}
            placeholder="Who it is for, what it does, and what makes it different."
          />
        </Field>
        <Field name="website" label="Website" required>
          <Input
            id="website"
            name="website"
            type="url"
            required
            maxLength={500}
            defaultValue={state.values?.website ?? saas?.website}
            placeholder="https://"
          />
        </Field>
      </Section>
      <Section title="Logo" description="A square logo works best.">
        <ImageField label="Upload logo" current={saas?.logo_path} name={saas?.name ?? ""} />
      </Section>
      <Section
        title="Visibility"
        description="Revenue and customers come from your payment provider and are private unless you share them. Only shared, verified MRR is ranked."
      >
        <div className="grid gap-2.5">
          <Share
            name="share_mrr"
            label="Show verified MRR publicly"
            checked={shared("share_mrr")}
          />
          <Share
            name="share_customers"
            label="Show paying customer count publicly"
            checked={shared("share_customers")}
          />
        </div>
        <div className="grid gap-2.5 sm:max-w-xs">
          <Field name="launched_on" label="Launch date">
            <Input
              id="launched_on"
              name="launched_on"
              type="date"
              defaultValue={state.values?.launched_on ?? settings?.launched_on ?? ""}
            />
          </Field>
          <Share
            name="share_launch"
            label="Share launch date publicly"
            checked={shared("share_launch")}
          />
        </div>
      </Section>
      <div className="grid gap-4">
        <Feedback state={state} />
        <Actions>
          <Button asChild variant="ghost">
            <Link href="/dashboard">Cancel</Link>
          </Button>
          <Submit>{saas ? "Save changes" : "Add SaaS"}</Submit>
        </Actions>
      </div>
    </form>
  );
}
