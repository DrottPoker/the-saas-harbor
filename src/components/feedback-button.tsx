"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { feedbackHref } from "@/lib/feedback";

/**
 * A button in the corner of every page that opens the feedback form, remembering the page. On
 * phones it would cover content, so the footer's Send feedback link stands in there. It is left
 * out of the admin panel, where the feedback is read.
 */
export function FeedbackButton() {
  const path = usePathname();
  if (path === "/feedback" || path.startsWith("/admin")) return null;
  return (
    <Link
      href={feedbackHref(path)}
      className="fixed right-5 bottom-5 z-30 hidden items-center gap-1.5 rounded-full border bg-surface px-3.5 py-2 text-sm font-medium text-foreground shadow-lg shadow-black/10 transition-colors hover:border-border-strong sm:inline-flex"
    >
      <MessageSquarePlus aria-hidden="true" className="size-4 text-brand" />
      Feedback
    </Link>
  );
}
