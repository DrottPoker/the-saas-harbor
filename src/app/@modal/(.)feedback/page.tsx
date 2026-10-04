import { headers } from "next/headers";
import { FeedbackDialog } from "@/components/feedback-form";
import { FullPageLoad } from "@/components/route-dialog";
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
  if (opening === "page") return <FullPageLoad href={feedbackHref(from)} />;
  return <FeedbackDialog from={from} visitor={!(await currentUser())} />;
}
