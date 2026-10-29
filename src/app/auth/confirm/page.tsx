import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "@/components/link";
import { ClientMessages } from "@/components/client-messages";
import { ConfirmLinkForm } from "@/components/forms";
import { LogoMark } from "@/components/logo";
import { emailLink, type EmailLinkType } from "@/lib/domain";
import { firstValues, type SearchParams } from "@/lib/params";

type Props = { searchParams: Promise<SearchParams> };

// Each kind of link's texts, in auth.confirm.
const copyKey = {
  email: "email",
  recovery: "recovery",
  email_change: "emailChange",
} as const satisfies Record<EmailLinkType, string>;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const [params, t] = await Promise.all([
    searchParams.then(firstValues),
    getTranslations("auth.confirm"),
  ]);
  const link = emailLink(params.token_hash, params.type);
  // The address holds a one-time token, so it is never sent to another page as a referrer.
  return {
    title: link ? t(`${copyKey[link.type]}.title`) : t("incompleteMeta"),
    referrer: "no-referrer",
  };
}

// Email links open here in any browser. The token is only used when the button is pressed.
export default async function Confirm({ searchParams }: Props) {
  const [params, t] = await Promise.all([
    searchParams.then(firstValues),
    getTranslations("auth.confirm"),
  ]);
  const link = emailLink(params.token_hash, params.type);
  const key = link && copyKey[link.type];
  return (
    <div className="mx-auto w-full max-w-sm px-4 pt-14 sm:pt-24">
      <LogoMark className="size-14" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        {key ? t(`${key}.title`) : t("incompleteTitle")}
      </h1>
      <p className="mt-1.5 text-muted-foreground">
        {key ? t(`${key}.description`) : t("incompleteBody")}
      </p>
      <div className="mt-8">
        {link && key ? (
          <>
            <ClientMessages namespaces={["auth"]}>
              <ConfirmLinkForm
                tokenHash={link.tokenHash}
                type={link.type}
                submit={t(`${key}.submit`)}
              />
            </ClientMessages>
            <p className="mt-6 text-[13px] text-muted-foreground">{t("whyClick")}</p>
          </>
        ) : (
          <Link className="text-sm font-medium hover:underline" href="/auth">
            {t("backToSignIn")}
          </Link>
        )}
      </div>
    </div>
  );
}
