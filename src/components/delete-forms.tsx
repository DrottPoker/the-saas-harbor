"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "@/components/link";
import { deleteAccountAction, deleteSaasAction } from "@/app/actions";
import { Feedback, Field, Section, Submit } from "./forms";
import { oauthStartPath, PROVIDER_NAMES, type OAuthProvider } from "@/lib/auth";
import { ProviderButton } from "./provider-button";
import { Notice } from "./shell";
import { Input } from "./ui/input";
import { useEditorAction } from "./use-editor-action";

// Both forms read the account messages, which their pages pass to the browser.

function DeleteSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="mt-10 scroll-mt-6 border-t pt-8">
      <Section title={title} description={description}>
        {children}
      </Section>
    </div>
  );
}

export function DeleteAccount({
  method,
  confirmed = false,
  failed = false,
}: {
  /** Accounts without a password confirm by signing in with their provider again. */
  method: "password" | OAuthProvider;
  /** Whether this session signed in with Google or GitHub in the last five minutes. */
  confirmed?: boolean;
  /** Whether the last confirmation with the provider did not finish. */
  failed?: boolean;
}) {
  const t = useTranslations("account.deleteAccount");
  const locale = useLocale();
  const [state, action] = useEditorAction(deleteAccountAction);
  const provider = method === "password" ? null : method;
  const name = provider ? PROVIDER_NAMES[provider] : "";
  return (
    <DeleteSection id="delete-account" title={t("title")} description={t("description")}>
      <form action={action} className="grid gap-5">
        <div className="grid gap-2 text-sm text-muted-foreground">
          <p>{t("whatGoes")}</p>
          <p>
            {t.rich("keys", {
              link: (chunks) => (
                <Link href="/privacy" className="font-medium text-foreground underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
        {!provider ? (
          <Field name="delete_password" label={t("password")}>
            <Input
              id="delete_password"
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={128}
              required
            />
          </Field>
        ) : confirmed ? (
          <Notice>{t("confirmed", { provider: name })}</Notice>
        ) : (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">{t("confirmFirst", { provider: name })}</p>
            {failed && <Notice tone="error">{t("failed", { provider: name })}</Notice>}
            <div>
              <ProviderButton
                provider={provider}
                href={oauthStartPath(provider, { confirm: true, locale })}
                className="h-9"
              >
                {t("confirmWith", { provider: name })}
              </ProviderButton>
            </div>
          </div>
        )}
        <Feedback state={state} />
        {(!provider || confirmed) && (
          <div>
            <Submit variant="destructive" pendingLabel={t("deleting")}>
              {t("submit")}
            </Submit>
          </div>
        )}
      </form>
    </DeleteSection>
  );
}

export function DeleteProduct({
  saasId,
  name,
  connected,
}: {
  saasId: string;
  name: string;
  connected: boolean;
}) {
  const t = useTranslations("account.deleteProduct");
  const [state, action] = useEditorAction(deleteSaasAction.bind(null, saasId));
  return (
    <DeleteSection id="delete-product" title={t("title")} description={t("description")}>
      <form action={action} className="grid gap-5">
        <div className="grid gap-2 text-sm text-muted-foreground">
          <p>{t("whatGoes")}</p>
          {connected && <p>{t("connected")}</p>}
        </div>
        <Field name="confirm_name" label={t("confirmName", { name })}>
          <Input
            id="confirm_name"
            name="confirm_name"
            autoComplete="off"
            spellCheck={false}
            maxLength={200}
            required
          />
        </Field>
        <Feedback state={state} />
        <div>
          <Submit variant="destructive" pendingLabel={t("deleting")}>
            {t("submit")}
          </Submit>
        </div>
      </form>
    </DeleteSection>
  );
}
