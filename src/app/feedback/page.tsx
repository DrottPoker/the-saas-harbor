import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FeedbackForm } from "@/components/feedback-form";
import { PageHeader, Shell } from "@/components/shell";
import { feedbackHref, feedbackPage } from "@/lib/feedback";
import { firstValues, type SearchParams } from "@/lib/params";
import { currentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Send feedback",
  robots: { index: false },
};

export default async function SendFeedback({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const from = feedbackPage(firstValues(await searchParams).from);
  // Feedback comes from signed-in users, so sign-in continues here, remembering the page.
  if (!(await currentUser())) redirect(`/auth?next=${encodeURIComponent(feedbackHref(from))}`);
  return (
    <Shell size="narrow">
      <PageHeader
        className="border-b"
        title="Send feedback"
        description="Report a bug or an error, suggest something, or tell us what you think."
      />
      <div className="pt-8">
        <FeedbackForm from={from} />
      </div>
    </Shell>
  );
}
