"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { changeEmailAction, changePasswordAction, sendPasswordLinkAction } from "@/app/actions";
import { PROVIDER_NAMES, type OAuthProvider } from "@/lib/auth";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, type ActionState } from "@/lib/domain";
import { Feedback, Field, Submit } from "./forms";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useEditorAction } from "./use-editor-action";

/** A new email address, confirmed from the current address and the new one. */
export function ChangeEmailForm({ email }: { email: string }) {
  const t = useTranslations("account.email");
  const [state, action] = useEditorAction(changeEmailAction);
  return (
    <form action={action} className="grid gap-5">
      <p className="text-sm text-muted-foreground">
        {t.rich("current", {
          email: () => (
            <strong className="font-medium text-foreground [overflow-wrap:anywhere]">
              {email}
            </strong>
          ),
        })}
      </p>
      <Field name="new_email" label={t("newLabel")} hint={t("newHint")}>
        <Input
          id="new_email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          defaultValue={state.success ? "" : state.values?.email}
        />
      </Field>
      <Feedback state={state} />
      <div>
        <Submit pendingLabel={t("sending")}>{t("submit")}</Submit>
      </div>
    </form>
  );
}

/** Sends a link to choose a password by email. */
function PasswordLink({ label }: { label: string }) {
  const t = useTranslations("account.password");
  const [result, setResult] = useState<ActionState>({});
  const [sending, startSending] = useTransition();
  return (
    <div className="grid gap-3">
      <Feedback state={result} />
      <div>
        <Button
          type="button"
          variant="outline"
          disabled={sending}
          onClick={() => startSending(async () => setResult(await sendPasswordLinkAction()))}
        >
          {sending ? t("sending") : label}
        </Button>
      </div>
    </div>
  );
}

/**
 * A new password for an account that has one, checked against the current password. An account
 * that signs in with Google or GitHub can choose a password by email instead.
 */
export function PasswordSettings({ method }: { method: "password" | OAuthProvider }) {
  const t = useTranslations("account.password");
  const [state, action] = useEditorAction(changePasswordAction);
  if (method !== "password")
    return (
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          {t("withProvider", { provider: PROVIDER_NAMES[method] })}
        </p>
        <PasswordLink label={t("sendLink")} />
      </div>
    );
  return (
    <div className="grid gap-6">
      <form action={action} className="grid gap-5">
        <Field name="current_password" label={t("current")}>
          <Input
            id="current_password"
            name="current_password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={PASSWORD_MAX_LENGTH}
          />
        </Field>
        <Field
          name="new_password"
          label={t("new")}
          hint={t("newHint", { min: PASSWORD_MIN_LENGTH })}
        >
          <Input
            id="new_password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
          />
        </Field>
        <Feedback state={state} />
        <div>
          <Submit pendingLabel={t("changing")}>{t("submit")}</Submit>
        </div>
      </form>
      <div className="grid gap-3 border-t pt-5">
        <p className="text-sm text-muted-foreground">{t("forgot")}</p>
        <PasswordLink label={t("sendNewLink")} />
      </div>
    </div>
  );
}
