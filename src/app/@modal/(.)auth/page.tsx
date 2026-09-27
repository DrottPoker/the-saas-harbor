import { AuthDialog } from "@/components/auth-dialog";
import { authHeadings, authMode, AuthPanel } from "@/components/auth-panel";
import { firstValues, type SearchParams } from "@/lib/params";
import { requireUser } from "@/lib/supabase/server";

/** /auth opened from a link inside the site: the same forms, in a dialog over the page. */
export default async function AuthModal({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const mode = authMode(firstValues(params).mode);
  if (mode === "update") await requireUser();
  const { title, description } = authHeadings[mode];
  return (
    <AuthDialog title={title} description={description}>
      <AuthPanel searchParams={params} />
    </AuthDialog>
  );
}
