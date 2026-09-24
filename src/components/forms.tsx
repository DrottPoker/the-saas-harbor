"use client";

import { useEditorAction } from "./use-editor-action";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { ArrowRight, ImagePlus, LockKeyhole } from "lucide-react";
import { authenticate, saveProfile, saveSaas } from "@/app/actions";
import { categories, usdInput, type ActionState } from "@/lib/domain";
import type { Profile, Saas, Report } from "@/lib/data";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button size="lg" type="submit" disabled={pending}>
      {pending ? "Saving..." : children}
      <ArrowRight size={16} />
    </Button>
  );
}
function Feedback({ state }: { state: ActionState }) {
  return (
    <div aria-live="polite">
      {state.error && (
        <p className="notice error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && <p className="notice success">{state.success}</p>}
    </div>
  );
}
function Field({
  name,
  label,
  children,
  hint,
}: {
  name: string;
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="field">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}
function ImageField({ hasImage }: { hasImage: boolean }) {
  return (
    <div className="image-upload">
      <ImagePlus size={24} />
      <Field
        name="image"
        label="Upload image"
        hint="PNG, JPEG or WebP, up to 2 MB. Uploaded images are public."
      >
        <Input name="image" id="image" type="file" accept="image/png,image/jpeg,image/webp" />
      </Field>
      {hasImage && (
        <label className="check">
          <input type="checkbox" name="remove_image" /> Remove current image
        </label>
      )}
    </div>
  );
}
export function AuthForm({ mode }: { mode: "login" | "signup" | "reset" | "update" }) {
  const [state, action] = useEditorAction(authenticate.bind(null, mode));
  return (
    <form action={action} className="form-stack">
      {mode !== "update" && (
        <Field name="email" label="Email address">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
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
      {mode === "login" && (
        <Link className="text-link small" href="/auth?mode=reset">
          Forgot your password?
        </Link>
      )}
      <Feedback state={state} />
      <Submit>
        {mode === "login"
          ? "Sign in"
          : mode === "signup"
            ? "Create account"
            : mode === "reset"
              ? "Send reset link"
              : "Update password"}
      </Submit>
      <p className="field-hint">
        {mode === "login" ? (
          <>
            New to the harbor? <Link href="/auth?mode=signup">Create an account</Link>
          </>
        ) : (
          <Link href="/auth">Back to sign in</Link>
        )}
      </p>
    </form>
  );
}
export function ProfileForm({ profile }: { profile: Profile | null }) {
  const [state, action] = useEditorAction(saveProfile);
  return (
    <form action={action} className="form-stack">
      <Field name="name" label="Your name">
        <Input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={60}
          defaultValue={state.values?.name ?? profile?.name}
          placeholder="How should we call you?"
        />
      </Field>
      <Field name="bio" label="A little about you" hint="Up to 400 characters.">
        <Textarea
          id="bio"
          name="bio"
          maxLength={400}
          rows={4}
          defaultValue={state.values?.bio ?? profile?.bio}
          placeholder="What are you building, and why?"
        />
      </Field>
      <div className="form-grid">
        <Field name="website" label="Website">
          <Input
            id="website"
            name="website"
            type="url"
            maxLength={500}
            defaultValue={state.values?.website ?? profile?.website}
            placeholder="https://your-site.com"
          />
        </Field>
        <Field name="social_url" label="Social profile">
          <Input
            id="social_url"
            name="social_url"
            type="url"
            maxLength={500}
            defaultValue={state.values?.social_url ?? profile?.social_url}
            placeholder="https://..."
          />
        </Field>
      </div>
      <ImageField hasImage={!!profile?.avatar_path} />
      <Feedback state={state} />
      <Submit>Save profile</Submit>
    </form>
  );
}
export function SaasForm({
  id,
  saas,
  report,
}: {
  id: string;
  saas?: Saas;
  report?: Report | null;
}) {
  const [state, action] = useEditorAction(saveSaas);
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="id" value={id} />
      <div className="form-grid">
        <Field name="name" label="SaaS name">
          <Input
            id="name"
            name="name"
            required
            minLength={2}
            maxLength={80}
            defaultValue={state.values?.name ?? saas?.name}
            placeholder="Your next big thing"
          />
        </Field>
        <Field name="category" label="Category">
          <select
            id="category"
            name="category"
            defaultValue={state.values?.category ?? saas?.category ?? "Productivity"}
            className="select"
          >
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        name="tagline"
        label="One-line pitch"
        hint="A clear description in 140 characters or less."
      >
        <Input
          id="tagline"
          name="tagline"
          required
          minLength={5}
          maxLength={140}
          defaultValue={state.values?.tagline ?? saas?.tagline}
          placeholder="What does your product help people do?"
        />
      </Field>
      <Field name="description" label="The story behind your SaaS">
        <Textarea
          id="description"
          name="description"
          required
          minLength={20}
          maxLength={5000}
          rows={6}
          defaultValue={state.values?.description ?? saas?.description}
          placeholder="Tell us what you built, who it is for, and what makes it useful."
        />
      </Field>
      <Field name="website" label="Product website">
        <Input
          id="website"
          name="website"
          type="url"
          required
          maxLength={500}
          defaultValue={state.values?.website ?? saas?.website}
          placeholder="https://your-product.com"
        />
      </Field>
      <ImageField hasImage={!!saas?.logo_path} />
      <div className="metrics-editor">
        <div className="section-heading">
          <LockKeyhole size={19} />
          <h2>Your numbers, your choice.</h2>
        </div>
        <p className="muted small">
          Every metric is optional and private by default. Only a shared MRR appears on the
          leaderboard. All shared numbers are labeled self-reported.
        </p>
        <div className="form-grid">
          <Field name="mrr" label="Monthly recurring revenue (USD)">
            <Input
              id="mrr"
              name="mrr"
              inputMode="decimal"
              placeholder="0.00"
              defaultValue={state.values?.mrr ?? usdInput(report?.mrr_cents)}
            />
          </Field>
          <Field name="customers" label="Paying customers">
            <Input
              id="customers"
              name="customers"
              inputMode="numeric"
              placeholder="0"
              defaultValue={state.values?.customers ?? report?.customers ?? ""}
            />
          </Field>
        </div>
        <div className="form-grid">
          <label className="check">
            <input
              name="public_mrr"
              type="checkbox"
              defaultChecked={state.values ? !!state.values.public_mrr : report?.public_mrr}
            />{" "}
            Share MRR publicly
          </label>
          <label className="check">
            <input
              name="public_customers"
              type="checkbox"
              defaultChecked={
                state.values ? !!state.values.public_customers : report?.public_customers
              }
            />{" "}
            Share customer count publicly
          </label>
        </div>
        <Field name="launched_on" label="Launch date">
          <Input
            id="launched_on"
            name="launched_on"
            type="date"
            defaultValue={state.values?.launched_on ?? report?.launched_on ?? ""}
          />
        </Field>
        <label className="check">
          <input
            name="public_launch"
            type="checkbox"
            defaultChecked={state.values ? !!state.values.public_launch : report?.public_launch}
          />{" "}
          Share launch date publicly
        </label>
        <p className="field-hint">
          Saving creates a dated metric report. Turning off sharing removes that metric from the
          public profile and ranking immediately.
        </p>
      </div>
      <Feedback state={state} />
      <div className="form-actions">
        <Submit>{saas ? "Save changes" : "Add your SaaS"}</Submit>
        <Link href="/dashboard" className="text-link">
          Cancel
        </Link>
      </div>
    </form>
  );
}
