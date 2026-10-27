"use client";

import Link from "@/components/link";
import { MessageSquarePlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePagePath } from "@/i18n/client";
import { feedbackHref } from "@/lib/feedback";

/**
 * A link that opens the feedback form in a dialog over the page, remembering the page. Visitors
 * send feedback too, without an account.
 */
export function FeedbackLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={feedbackHref(usePagePath())} className={className}>
      {children}
    </Link>
  );
}

/**
 * A button in the corner of every page that opens the feedback form. On phones it would cover
 * content, so the footer's Send feedback link stands in there. It is left out of the admin panel,
 * where the feedback is read, and out of Messages, where it would cover the message field.
 */
export function FeedbackButton() {
  const t = useTranslations("chrome");
  const path = usePagePath();
  if (path === "/feedback" || /^\/(admin|messages)(\/|$)/.test(path)) return null;
  return (
    <FeedbackLink className="fixed end-5 bottom-5 z-30 hidden items-center gap-1.5 rounded-full border bg-surface px-3.5 py-2 text-sm font-medium text-foreground shadow-float transition-colors hover:border-border-strong sm:inline-flex">
      <MessageSquarePlus aria-hidden="true" className="size-4 text-brand" />
      {t("feedback")}
    </FeedbackLink>
  );
}
