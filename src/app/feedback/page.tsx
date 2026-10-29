import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ClientMessages } from "@/components/client-messages";
import { FeedbackForm } from "@/components/feedback-form";
import { PageHeader, Shell } from "@/components/shell";
import { feedbackPage } from "@/lib/feedback";
import { firstValues, type SearchParams } from "@/lib/params";
import { currentUser } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("feedback.heading");
  return { title: t("title"), robots: { index: false } };
}

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
  const [visitor, t] = await Promise.all([
    currentUser().then((user) => !user),
    getTranslations("feedback.heading"),
  ]);
  return (
    <Shell size="narrow">
      <PageHeader className="border-b" title={t("title")} description={t("description")} />
      <div className="pt-8">
        <ClientMessages namespaces={["feedback"]}>
          <FeedbackForm from={from} visitor={visitor} />
        </ClientMessages>
      </div>
    </Shell>
  );
}
