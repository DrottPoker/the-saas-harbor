import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { FinishSignupForm } from "@/components/forms";
import { LogoMark } from "@/components/logo";
import { safeNext } from "@/lib/domain";
import { firstValues, type SearchParams } from "@/lib/params";
import { requireUser, signupFinished } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Choose your username" };

// After the first sign-in with Google: the username and the Terms of Service, which sign-up with
// email asks for before the account is created. Nothing else opens until this is done.
export default async function FinishSignup({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user } = await requireUser({ unfinished: true });
  const next = safeNext(firstValues(await searchParams).next);
  if (await signupFinished()) redirect(next || "/dashboard");
  return (
    <div className="mx-auto w-full max-w-sm px-4 pt-14 sm:pt-24">
      <LogoMark className="size-14" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Choose your username</h1>
      <p className="mt-1.5 text-muted-foreground">
        One more step to create your account
        {user.email && (
          <>
            {" "}
            for{" "}
            <strong className="font-medium text-foreground [overflow-wrap:anywhere]">
              {user.email}
            </strong>
          </>
        )}
        .
      </p>
      <div className="mt-8 grid gap-5">
        <FinishSignupForm next={next} />
        <form action={signOut} className="text-center text-sm text-muted-foreground">
          Not now?{" "}
          <button type="submit" className="font-medium text-foreground hover:underline">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
