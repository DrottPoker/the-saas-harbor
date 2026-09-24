import type { Metadata } from "next";
import { AuthForm } from "@/components/forms";
import { LogoMark } from "@/components/logo";
import { Notice } from "@/components/shell";
import { supabaseConfig } from "@/lib/supabase/config";
import { requireUser } from "@/lib/supabase/server";

type Mode = "login" | "signup" | "reset" | "update";
type Props = { searchParams: Promise<Record<string, string | undefined>> };

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

function modeOf(value: string | undefined): Mode {
  return value === "signup" || value === "reset" || value === "update" ? value : "login";
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return { title: copy[modeOf((await searchParams).mode)].title };
}

export default async function Auth({ searchParams }: Props) {
  const params = await searchParams;
  const mode = modeOf(params.mode);
  if (mode === "update") await requireUser();
  const { title, description } = copy[mode];
  return (
    <div className="mx-auto w-full max-w-sm px-4 pt-14 sm:pt-24">
      <LogoMark className="size-9 text-brand" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-muted-foreground">{description}</p>
      <div className="mt-8 grid gap-5">
        {params.callback_error && (
          <Notice tone="error">
            This link has expired or was opened in another browser. Sign in, or request a new reset
            link.
          </Notice>
        )}
        {supabaseConfig() ? (
          <AuthForm mode={mode} />
        ) : (
          <Notice tone="error">
            Authentication is not configured. Follow the Supabase setup in README.md.
          </Notice>
        )}
      </div>
    </div>
  );
}
