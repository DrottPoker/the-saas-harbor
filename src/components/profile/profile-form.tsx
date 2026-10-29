"use client";

import { startTransition, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import Link from "@/components/link";
import { saveProfile } from "@/app/actions";
import type { Profile } from "@/lib/data";
import { USERNAME_CHANGE_DAYS } from "@/lib/domain";
import { Actions, Feedback, Field, ImageField, Section, Submit, UsernameInput } from "../forms";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useEditorAction } from "../use-editor-action";

export function ProfileForm({
  profile,
  usernameLockDays,
}: {
  profile: Profile | null;
  /** In how many days the username can be changed again, or null when it can now. */
  usernameLockDays: number | null;
}) {
  const t = useTranslations("account.profile");
  const [state, action, pending] = useEditorAction(saveProfile);
  const form = useRef<HTMLFormElement>(null);
  // A saved photo must not be uploaded again with the next save.
  useEffect(() => {
    if (!state.success) return;
    for (const input of form.current?.querySelectorAll<HTMLInputElement>("input[type=file]") ?? [])
      input.value = "";
  }, [state]);
  const text = (key: keyof Profile & string) =>
    state.values?.[key] ?? (profile?.[key] as string | null | undefined) ?? "";
  const locked = usernameLockDays != null;

  return (
    // Submitted from onSubmit rather than the action prop, so React does not reset the form after
    // a failed save: a reset would clear a chosen photo and the remove box.
    <form
      ref={form}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <Section title={t("introTitle")} description={t("introDescription")}>
        <Field name="name" label={t("name")}>
          <Input
            id="name"
            name="name"
            dir="auto"
            required
            minLength={2}
            maxLength={60}
            autoComplete="name"
            defaultValue={text("name")}
          />
        </Field>
        <Field
          name="username"
          label={t("username")}
          hint={
            locked
              ? t("usernameLockedHint", { days: usernameLockDays })
              : t("usernameHint", { days: USERNAME_CHANGE_DAYS })
          }
        >
          {/* Read-only rather than disabled, so the current username is still sent. */}
          <UsernameInput
            readOnly={locked}
            defaultValue={
              locked ? (profile?.slug ?? "") : (state.values?.username ?? profile?.slug ?? "")
            }
          />
        </Field>
        <Field name="headline" label={t("headline")} hint={t("headlineHint")}>
          <Input
            id="headline"
            name="headline"
            dir="auto"
            maxLength={120}
            defaultValue={text("headline")}
          />
        </Field>
        <Field name="location" label={t("location")} hint={t("locationHint")}>
          <Input
            id="location"
            name="location"
            dir="auto"
            maxLength={80}
            autoComplete="address-level2"
            defaultValue={text("location")}
          />
        </Field>
      </Section>
      <Section title={t("photoTitle")} description={t("photoDescription")}>
        <ImageField
          label={t("photoUpload")}
          current={profile?.avatar_path}
          name={profile?.name ?? ""}
          person
        />
      </Section>
      <Section title={t("linksTitle")} description={t("linksDescription")}>
        <Field name="website" label={t("website")}>
          <Input
            id="website"
            name="website"
            type="text"
            dir="auto"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={500}
            placeholder="example.com"
            defaultValue={text("website")}
          />
        </Field>
        {/* Brand names, the same in every language. */}
        <Field name="linkedin_url" label="LinkedIn">
          <Input
            id="linkedin_url"
            name="linkedin_url"
            type="text"
            dir="auto"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={500}
            placeholder="linkedin.com/in/your-name"
            defaultValue={text("linkedin_url")}
          />
        </Field>
        <Field name="github_url" label="GitHub">
          <Input
            id="github_url"
            name="github_url"
            type="text"
            dir="auto"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={500}
            placeholder="github.com/your-name"
            defaultValue={text("github_url")}
          />
        </Field>
        <Field name="x_url" label="X">
          <Input
            id="x_url"
            name="x_url"
            type="text"
            dir="auto"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={500}
            placeholder="x.com/your-name"
            defaultValue={text("x_url")}
          />
        </Field>
        <Field name="social_url" label={t("otherLink")} hint={t("otherLinkHint")}>
          <Input
            id="social_url"
            name="social_url"
            type="text"
            dir="auto"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={500}
            placeholder="example.com"
            defaultValue={text("social_url")}
          />
        </Field>
      </Section>
      <div className="grid gap-4">
        <Feedback state={state} />
        <Actions>
          <Button asChild variant="ghost">
            <Link href="/dashboard">{t("cancel")}</Link>
          </Button>
          <Submit pending={pending} pendingLabel={t("saving")}>
            {t("submit")}
          </Submit>
        </Actions>
      </div>
    </form>
  );
}
