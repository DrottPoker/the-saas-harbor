"use client";

import { startTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { saveProfile } from "@/app/actions";
import type { Profile } from "@/lib/data";
import { USERNAME_CHANGE_DAYS, usernameLockedMessage } from "@/lib/domain";
import { Actions, Feedback, Field, ImageField, Section, Submit, UsernameInput } from "../forms";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useEditorAction } from "../use-editor-action";

export function ProfileForm({
  profile,
  usernameAvailableAt,
}: {
  profile: Profile | null;
  /** When the username can be changed again, or null when it can now. */
  usernameAvailableAt: string | null;
}) {
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
      <Section
        title="Intro"
        description="Shown at the top of your profile and next to your products."
      >
        <Field name="name" label="Name">
          <Input
            id="name"
            name="name"
            required
            minLength={2}
            maxLength={60}
            autoComplete="name"
            defaultValue={text("name")}
          />
        </Field>
        <Field
          name="username"
          label="Username"
          hint={
            usernameAvailableAt
              ? `Shown as @username under your name, and used as your profile address. ${usernameLockedMessage(usernameAvailableAt)}`
              : `Shown as @username under your name, and used as your profile address. After a change, you can change it again in ${USERNAME_CHANGE_DAYS} days.`
          }
        >
          {/* Read-only rather than disabled, so the current username is still sent. */}
          <UsernameInput
            readOnly={!!usernameAvailableAt}
            defaultValue={
              usernameAvailableAt
                ? (profile?.slug ?? "")
                : (state.values?.username ?? profile?.slug ?? "")
            }
          />
        </Field>
        <Field
          name="headline"
          label="Headline"
          hint="For example: Solo founder building tools for finance teams."
        >
          <Input id="headline" name="headline" maxLength={120} defaultValue={text("headline")} />
        </Field>
        <Field name="location" label="Location" hint="City and country, if you want to share it.">
          <Input
            id="location"
            name="location"
            maxLength={80}
            autoComplete="address-level2"
            defaultValue={text("location")}
          />
        </Field>
      </Section>
      <Section title="Photo" description="A square photo works best.">
        <ImageField
          label="Upload photo"
          current={profile?.avatar_path}
          name={profile?.name ?? ""}
          person
        />
      </Section>
      <Section
        title="Links"
        description="Web addresses, with or without https://. LinkedIn, GitHub and X show with their icons."
      >
        <Field name="website" label="Website">
          <Input
            id="website"
            name="website"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={500}
            placeholder="example.com"
            defaultValue={text("website")}
          />
        </Field>
        <Field name="linkedin_url" label="LinkedIn">
          <Input
            id="linkedin_url"
            name="linkedin_url"
            type="text"
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
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={500}
            placeholder="x.com/your-name"
            defaultValue={text("x_url")}
          />
        </Field>
        <Field
          name="social_url"
          label="Other link"
          hint="Any other profile, such as a newsletter or a podcast."
        >
          <Input
            id="social_url"
            name="social_url"
            type="text"
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
            <Link href="/dashboard">Cancel</Link>
          </Button>
          <Submit pending={pending}>Save profile</Submit>
        </Actions>
      </div>
    </form>
  );
}
