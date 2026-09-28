import type { Metadata } from "next";
import { FeedbackForm } from "@/components/feedback-form";
import { PageHeader, Shell } from "@/components/shell";
import { feedbackHeading, feedbackHref, feedbackPage } from "@/lib/feedback";
import { firstValues, type SearchParams } from "@/lib/params";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: feedbackHeading.title,
  robots: { index: false },
};

/**
 * The feedback form as a page, for direct visits, reloads and the return from the full sign-in
 * page. Links inside the site open it in a dialog over the current page instead
 * (`src/app/@modal/(.)feedback`).
 */
export default async function SendFeedback({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const from = feedbackPage(firstValues(await searchParams).from);
  // Feedback comes from signed-in users, so sign-in continues here, remembering the page.
  await requireUser({ next: feedbackHref(from) });
  return (
    <Shell size="narrow">
      <PageHeader className="border-b" {...feedbackHeading} />
      <div className="pt-8">
        <FeedbackForm from={from} />
      </div>
    </Shell>
  );
}
