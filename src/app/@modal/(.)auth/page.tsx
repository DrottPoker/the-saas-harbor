import { headers } from "next/headers";
import { authHeading, authMode, AuthPanel } from "@/components/auth-panel";
import { LogoMark } from "@/components/logo";
import { FullPageLoad, RouteDialog } from "@/components/route-dialog";
import { authNeedsFullPage } from "@/lib/auth";
import { safeNext } from "@/lib/domain";
import { firstValues, type SearchParams } from "@/lib/params";
import { requireUser } from "@/lib/supabase/server";

/** /auth opened from a link inside the site: the same forms, in a dialog over the page. */
export default async function AuthModal({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  // A page that sends visitors here would stay under the dialog and send them here again.
  if (authNeedsFullPage((await headers()).get("next-url"))) {
    const query = new URLSearchParams(
      Object.entries(firstValues(params)).filter((entry): entry is [string, string] => !!entry[1]),
    );
    return <FullPageLoad href={`/auth${query.size ? `?${query}` : ""}`} />;
  }
  const mode = authMode(firstValues(params).mode);
  if (mode === "update") await requireUser();
  const { title, description } = authHeading(mode, safeNext(firstValues(params).next));
  return (
    <RouteDialog title={title} description={description} icon={<LogoMark className="size-10" />}>
      <AuthPanel searchParams={params} />
    </RouteDialog>
  );
}
