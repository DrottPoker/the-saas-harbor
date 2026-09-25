"use client";

import { useEditorAction } from "./use-editor-action";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { authenticate, confirmEmailLinkAction, saveSaas } from "@/app/actions";
import { categories, type ActionState } from "@/lib/domain";
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
export function Field({
  name,
  label,
  hint,
  aside,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={name}>{label}</Label>
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

const authCopy = {
  login: "Sign in",
  signup: "Create account",
  reset: "Send reset link",
  update: "Update password",
} as const;

export function AuthForm({
  mode,
  next,
}: {
  mode: "login" | "signup" | "reset" | "update";
  /** Where to continue after signing in, already checked with safeNext(). */
  next?: string | null;
}) {
  const [state, action] = useEditorAction(authenticate.bind(null, mode));
  return (
    <form action={action} className="grid gap-5">
      {mode === "login" && next && <input type="hidden" name="next" value={next} />}
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
          hint={mode === "signup" || mode === "update" ? "At least 12 characters." : undefined}
          aside={
            mode === "login" && (
              <Link
                className="text-[13px] text-muted-foreground hover:text-foreground"
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
            minLength={mode === "login" ? 1 : 12}
            maxLength={128}
            required
          />
        </Field>
      )}
      <Feedback state={state} />
      <Submit className="h-10 w-full">{authCopy[mode]}</Submit>
      {mode === "signup" && (
        <p className="text-center text-[13px] text-muted-foreground">
          By creating an account you agree to the{" "}
          <Link className="font-medium text-foreground underline" href="/terms">
            terms
          </Link>
          . Read how we handle your data in the{" "}
          <Link className="font-medium text-foreground underline" href="/privacy">
            privacy policy
          </Link>
          .
        </p>
      )}
      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            No account yet?{" "}
            <Link className="font-medium text-foreground hover:underline" href="/auth?mode=signup">
              Create one
            </Link>
          </>
        ) : (
          <Link className="font-medium text-foreground hover:underline" href="/auth">
            Back to sign in
          </Link>
        )}
      </p>
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
      <Section title="Product" description="Shown on the public product page and in listings.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="name" label="Product name">
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
            <select
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
        <Field name="tagline" label="Tagline" hint="One sentence, up to 140 characters.">
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
        <Field name="description" label="Description">
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
        <Field name="website" label="Website">
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
        description="Revenue and customers come from Stripe and are private unless you share them. Only shared, verified MRR is ranked."
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
