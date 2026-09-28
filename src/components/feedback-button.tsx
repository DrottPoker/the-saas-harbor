"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { feedbackLink } from "@/lib/feedback";

/**
 * A link that opens the feedback form in a dialog over the page, remembering the page. Visitors
 * sign in first and continue there.
 */
export function FeedbackLink({
  signedIn,
  className,
  children,
}: {
  signedIn: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={feedbackLink(usePathname(), signedIn)} className={className}>
      {children}
    </Link>
  );
}

/**
 * A button in the corner of every page that opens the feedback form. On phones it would cover
 * content, so the footer's Send feedback link stands in there. It is left out of the admin panel,
 * where the feedback is read, out of Messages, where it would cover the message field, and out of
 * sign-in, where it would only lead a visitor to sign-in again.
 */
export function FeedbackButton({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  if (path === "/feedback" || /^\/(admin|messages|auth)(\/|$)/.test(path)) return null;
  return (
    <FeedbackLink
      signedIn={signedIn}
      className="fixed right-5 bottom-5 z-30 hidden items-center gap-1.5 rounded-full border bg-surface px-3.5 py-2 text-sm font-medium text-foreground shadow-float transition-colors hover:border-border-strong sm:inline-flex"
    >
      <MessageSquarePlus aria-hidden="true" className="size-4 text-brand" />
      Feedback
    </FeedbackLink>
  );
}
