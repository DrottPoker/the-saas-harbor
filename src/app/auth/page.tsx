import type { Metadata } from "next";
import { authHeading, authMode, AuthPanel } from "@/components/auth-panel";
import { LogoMark } from "@/components/logo";
import { requireUser } from "@/lib/supabase/server";
import { safeNext } from "@/lib/domain";
import { firstValues, type SearchParams } from "@/lib/params";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return { title: authHeading(authMode(firstValues(await searchParams).mode), null).title };
}

/**
 * The sign-in page, for direct visits, reloads and links from emails. Links inside the site open
 * the same forms in a dialog over the current page instead (`src/app/@modal/(.)auth`).
 */
export default async function Auth({ searchParams }: Props) {
  const params = await searchParams;
  const mode = authMode(firstValues(params).mode);
  if (mode === "update") await requireUser();
  const { title, description } = authHeading(mode, safeNext(firstValues(params).next));
  return (
    <div className="mx-auto w-full max-w-sm px-4 pt-14 sm:pt-24">
      <LogoMark className="size-14" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-muted-foreground">{description}</p>
      <div className="mt-8">
        <AuthPanel searchParams={params} />
      </div>
    </div>
  );
}
