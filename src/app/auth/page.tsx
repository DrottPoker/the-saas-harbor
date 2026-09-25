import type { Metadata } from "next";
import { AuthForm } from "@/components/forms";
import { LogoMark } from "@/components/logo";
import { Notice } from "@/components/shell";
import { safeNext } from "@/lib/domain";
import { supabaseConfig } from "@/lib/supabase/config";
import { requireUser } from "@/lib/supabase/server";
import { firstValues, type SearchParams } from "@/lib/params";

type Mode = "login" | "signup" | "reset" | "update";
type Props = { searchParams: Promise<SearchParams> };

const copy: Record<Mode, { title: string; description: string }> = {
  login: { title: "Sign in", description: "Welcome back. Sign in to manage your products." },
  signup: {
    title: "Create your account",
    description: "List your SaaS and choose which numbers to share.",
  },
  reset: {
    title: "Reset your password",
    description: "We will email you a link to choose a new password.",
  },
  update: { title: "Choose a new password", description: "Use at least 12 characters." },
};

// Set by scripts/local-env.mjs during local development only. Never shown for a remote address.
function localInbox() {
  const value = process.env.LOCAL_MAILPIT_URL;
  try {
    return value && ["127.0.0.1", "localhost"].includes(new URL(value).hostname) ? value : null;
  } catch {
    return null;
  }
}

function modeOf(value: string | undefined): Mode {
  return value === "signup" || value === "reset" || value === "update" ? value : "login";
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return { title: copy[modeOf(firstValues(await searchParams).mode)].title };
}

export default async function Auth({ searchParams }: Props) {
  const params = firstValues(await searchParams);
  const mode = modeOf(params.mode);
  if (mode === "update") await requireUser();
  const { title, description } = copy[mode];
  const inbox = localInbox();
  return (
    <div className="mx-auto w-full max-w-sm px-4 pt-14 sm:pt-24">
      <LogoMark className="size-9 text-brand-mark" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-muted-foreground">{description}</p>
      <div className="mt-8 grid gap-5">
        {supabaseConfig() ? (
          <AuthForm mode={mode} next={safeNext(params.next)} />
        ) : (
          <Notice tone="error">
            Authentication is not configured. Follow the Supabase setup in README.md.
          </Notice>
        )}
        {inbox && mode !== "update" && (
          <Notice>
            Local development: confirmation and reset emails are not sent to real inboxes.{" "}
            <a href={inbox} target="_blank" rel="noreferrer" className="font-medium underline">
              Open the local inbox
            </a>
          </Notice>
        )}
      </div>
    </div>
  );
}
