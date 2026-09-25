import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmLinkForm } from "@/components/forms";
import { LogoMark } from "@/components/logo";
import { emailLink } from "@/lib/domain";
import { firstValues, type SearchParams } from "@/lib/params";

type Props = { searchParams: Promise<SearchParams> };

const copy = {
  email: {
    title: "Confirm your email",
    description: "Confirm your email address to finish creating your account.",
    submit: "Confirm email",
  },
  recovery: {
    title: "Reset your password",
    description: "Continue to choose a new password for your account.",
    submit: "Choose a new password",
  },
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = firstValues(await searchParams);
  const link = emailLink(params.token_hash, params.type);
  // The address holds a one-time token, so it is never sent to another page as a referrer.
  return { title: link ? copy[link.type].title : "Link incomplete", referrer: "no-referrer" };
}

// Email links open here in any browser. The token is only used when the button is pressed.
export default async function Confirm({ searchParams }: Props) {
  const params = firstValues(await searchParams);
  const link = emailLink(params.token_hash, params.type);
  const text = link && copy[link.type];
  return (
    <div className="mx-auto w-full max-w-sm px-4 pt-14 sm:pt-24">
      <LogoMark className="size-9 text-brand-mark" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        {text ? text.title : "This link is incomplete"}
      </h1>
      <p className="mt-1.5 text-muted-foreground">
        {text
          ? text.description
          : "Open the link again from the email, or copy the whole address into your browser."}
      </p>
      <div className="mt-8">
        {link && text ? (
          <ConfirmLinkForm tokenHash={link.tokenHash} type={link.type} submit={text.submit} />
        ) : (
          <Link className="text-sm font-medium hover:underline" href="/auth">
            Back to sign in
          </Link>
        )}
      </div>
    </div>
  );
}
