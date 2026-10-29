import { headers } from "next/headers";
import { ClientMessages } from "@/components/client-messages";
import { FeedbackDialog } from "@/components/feedback-form";
import { FullPageLoad } from "@/components/route-dialog";
import { localePath } from "@/i18n/navigation";
import { feedbackHref, feedbackOpening, feedbackPage } from "@/lib/feedback";
import { firstValues, type SearchParams } from "@/lib/params";
import { currentUser } from "@/lib/supabase/server";

/** /feedback opened from a link inside the site: the same form, in a dialog over the page. */
export default async function FeedbackModal({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const from = feedbackPage(firstValues(await searchParams).from);
  const opening = feedbackOpening((await headers()).get("next-url"));
  if (opening === "none") return null;
  // The full page loads in the page's language.
  if (opening === "page") return <FullPageLoad href={await localePath(feedbackHref(from))} />;
  return (
    <ClientMessages namespaces={["feedback"]}>
      <FeedbackDialog from={from} visitor={!(await currentUser())} />
    </ClientMessages>
  );
}
