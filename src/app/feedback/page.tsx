import type { Metadata } from "next";
import { FeedbackForm } from "@/components/feedback-form";
import { PageHeader, Shell } from "@/components/shell";
import { feedbackHeading, feedbackPage } from "@/lib/feedback";
import { firstValues, type SearchParams } from "@/lib/params";
import { currentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: feedbackHeading.title,
  robots: { index: false },
};

/**
 * The feedback form as a page, for direct visits, reloads and links from the full sign-in page.
 * Links inside the site open it in a dialog over the current page instead
 * (`src/app/@modal/(.)feedback`). Visitors send it too, without an account.
 */
export default async function SendFeedback({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const from = feedbackPage(firstValues(await searchParams).from);
  const visitor = !(await currentUser());
  return (
    <Shell size="narrow">
      <PageHeader className="border-b" {...feedbackHeading} />
      <div className="pt-8">
        <FeedbackForm from={from} visitor={visitor} />
      </div>
    </Shell>
  );
}
