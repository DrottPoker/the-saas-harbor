import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { signOut } from "@/app/actions";
import { ClientMessages } from "@/components/client-messages";
import { FinishSignupForm } from "@/components/forms";
import { LogoMark } from "@/components/logo";
import { safeNext } from "@/lib/domain";
import { firstValues, type SearchParams } from "@/lib/params";
import { requireUser, signupFinished } from "@/lib/supabase/server";
import { localeRedirect } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth.finish"))("title") };
}

// After the first sign-in with Google or GitHub: the username and the Terms of Service, which
// sign-up with email asks for before the account is created. Nothing else opens until this is done.
export default async function FinishSignup({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user } = await requireUser({ unfinished: true });
  const next = safeNext(firstValues(await searchParams).next);
  if (await signupFinished()) return localeRedirect(next || "/dashboard");
  const t = await getTranslations("auth.finish");
  return (
    <div className="mx-auto w-full max-w-sm px-4 pt-14 sm:pt-24">
      <LogoMark className="size-14" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-1.5 text-muted-foreground">
        {user.email
          ? t.rich("intro", {
              email: () => (
                <strong className="font-medium text-foreground [overflow-wrap:anywhere]">
                  {user.email}
                </strong>
              ),
            })
          : t("introNoEmail")}
      </p>
      <div className="mt-8 grid gap-5">
        <ClientMessages namespaces={["auth"]}>
          <FinishSignupForm next={next} />
        </ClientMessages>
        <form action={signOut} className="text-center text-sm text-muted-foreground">
          {t.rich("notNow", {
            signOut: (chunks) => (
              <button type="submit" className="font-medium text-foreground hover:underline">
                {chunks}
              </button>
            ),
          })}
        </form>
      </div>
    </div>
  );
}
