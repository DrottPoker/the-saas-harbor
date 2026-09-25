"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { saveProfile } from "@/app/actions";
import type { Profile } from "@/lib/data";
import { MONTH_NAMES, type ProfileExperience } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { Actions, Feedback, Field, ImageField, Section, Submit, UsernameInput } from "../forms";
import { Button } from "../ui/button";
import { fieldClasses, Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { useEditorAction } from "../use-editor-action";

type Draft = {
  key: string;
  title: string;
  organization: string;
  startMonth: string;
  startYear: string;
  endMonth: string;
  endYear: string;
  current: boolean;
  description: string;
};

function draftFrom(role: ProfileExperience): Draft {
  return {
    key: role.id,
    title: role.title,
    organization: role.organization,
    startYear: role.starts_on.slice(0, 4),
    startMonth: role.starts_on.slice(5, 7),
    endYear: role.ends_on?.slice(0, 4) ?? "",
    endMonth: role.ends_on?.slice(5, 7) ?? "",
    current: role.ends_on === null,
    description: role.description,
  };
}

// The shape profileSchema expects. An incomplete date stays "" so the server names the problem.
function roleInput(draft: Draft) {
  const month = (year: string, month: string) => (year && month ? `${year}-${month}` : "");
  return {
    title: draft.title,
    organization: draft.organization,
    start: month(draft.startYear, draft.startMonth),
    end: draft.current ? null : month(draft.endYear, draft.endMonth),
    description: draft.description,
  };
}

function MonthYear({
  label,
  month,
  year,
  years,
  disabled,
  onChange,
}: {
  label: "Start" | "End";
  month: string;
  year: string;
  years: string[];
  disabled?: boolean;
  onChange: (value: { month?: string; year?: string }) => void;
}) {
  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="text-sm font-medium">{label} date</legend>
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label={`${label} month`}
          value={month}
          onChange={(event) => onChange({ month: event.target.value })}
          className={cn(fieldClasses, "h-10")}
        >
          <option value="">Month</option>
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={String(index + 1).padStart(2, "0")}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} year`}
          value={year}
          onChange={(event) => onChange({ year: event.target.value })}
          className={cn(fieldClasses, "h-10")}
        >
          <option value="">Year</option>
          {years.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}

function RoleEditor({
  draft,
  number,
  thisYear,
  onChange,
  onRemove,
}: {
  draft: Draft;
  number: number;
  thisYear: number;
  onChange: (change: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  const id = `role-${draft.key}`;
  // Roles cannot start in the future, and end at the latest this year.
  const years = Array.from({ length: thisYear - 1950 + 1 }, (_, index) => String(thisYear - index));
  return (
    <fieldset className="grid gap-4 rounded-lg border bg-subtle/40 p-4">
      <legend className="sr-only">Role {number}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name={`${id}-title`} label="Title">
          <Input
            id={`${id}-title`}
            value={draft.title}
            maxLength={100}
            required
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </Field>
        <Field name={`${id}-organization`} label="Company">
          <Input
            id={`${id}-organization`}
            value={draft.organization}
            maxLength={100}
            required
            onChange={(event) => onChange({ organization: event.target.value })}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <MonthYear
          label="Start"
          month={draft.startMonth}
          year={draft.startYear}
          years={years}
          onChange={({ month, year }) =>
            onChange({ startMonth: month ?? draft.startMonth, startYear: year ?? draft.startYear })
          }
        />
        <MonthYear
          label="End"
          month={draft.current ? "" : draft.endMonth}
          year={draft.current ? "" : draft.endYear}
          years={years}
          disabled={draft.current}
          onChange={({ month, year }) =>
            onChange({ endMonth: month ?? draft.endMonth, endYear: year ?? draft.endYear })
          }
        />
      </div>
      <label className="flex w-fit items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.current}
          onChange={(event) => onChange({ current: event.target.checked })}
          className="size-4 accent-brand"
        />
        I work here now
      </label>
      <Field
        name={`${id}-description`}
        label="Description"
        hint="Optional. Up to 1,000 characters."
      >
        <Textarea
          id={`${id}-description`}
          rows={3}
          maxLength={1000}
          value={draft.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </Field>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 />
          Remove
          <span className="sr-only"> {draft.title || `role ${number}`}</span>
        </Button>
      </div>
    </fieldset>
  );
}

export function ProfileForm({
  profile,
  experience,
  thisYear,
}: {
  profile: Profile | null;
  experience: ProfileExperience[];
  /** From the server, so the year lists match between the server and the browser. */
  thisYear: number;
}) {
  const [state, action, pending] = useEditorAction(saveProfile);
  const form = useRef<HTMLFormElement>(null);
  // A saved photo must not be uploaded again with the next save.
  useEffect(() => {
    if (!state.success) return;
    for (const input of form.current?.querySelectorAll<HTMLInputElement>("input[type=file]") ?? [])
      input.value = "";
  }, [state]);
  const [drafts, setDrafts] = useState(() => experience.map(draftFrom));
  const text = (key: keyof Profile & string) =>
    state.values?.[key] ?? (profile?.[key] as string | null | undefined) ?? "";

  const update = (key: string, change: Partial<Draft>) =>
    setDrafts((list) => list.map((draft) => (draft.key === key ? { ...draft, ...change } : draft)));
  const add = () =>
    setDrafts((list) => [
      ...list,
      {
        key: crypto.randomUUID(),
        title: "",
        organization: "",
        startMonth: "",
        startYear: "",
        endMonth: "",
        endYear: "",
        current: false,
        description: "",
      },
    ]);

  return (
    // Submitted from onSubmit rather than the action prop, so React does not reset the form after
    // saving: the roles are controlled, and a reset would show stale values next to the state that
    // is sent.
    <form
      ref={form}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <input type="hidden" name="experience" value={JSON.stringify(drafts.map(roleInput))} />
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
          hint="Shown as @username under your name, and used as your profile address."
        >
          <UsernameInput defaultValue={state.values?.username ?? profile?.slug ?? ""} />
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
        title="About"
        description="Your story: what you build, how you got here and what you care about."
      >
        <Field name="bio" label="About" hint="Up to 2,000 characters.">
          <Textarea id="bio" name="bio" rows={8} maxLength={2000} defaultValue={text("bio")} />
        </Field>
      </Section>
      <Section
        title="Experience"
        description="Current and past roles, including your own companies."
      >
        <div className="grid gap-4">
          {drafts.length ? (
            drafts.map((draft, index) => (
              <RoleEditor
                key={draft.key}
                draft={draft}
                number={index + 1}
                thisYear={thisYear}
                onChange={(change) => update(draft.key, change)}
                onRemove={() => setDrafts((all) => all.filter((item) => item.key !== draft.key))}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No experience added yet.</p>
          )}
          <div>
            <Button type="button" variant="outline" size="sm" onClick={add}>
              <Plus />
              Add experience
            </Button>
          </div>
        </div>
      </Section>
      <Section title="Skills" description="Skills and tools you are good at.">
        <Field
          name="skills"
          label="Skills"
          hint="Separate with commas, up to 20. For example: Next.js, Postgres, pricing."
        >
          <Input
            id="skills"
            name="skills"
            maxLength={1000}
            defaultValue={state.values?.skills ?? profile?.skills.join(", ") ?? ""}
          />
        </Field>
      </Section>
      <Section
        title="Links"
        description="Full https:// addresses. LinkedIn, GitHub and X show with their icons."
      >
        <Field name="website" label="Website">
          <Input
            id="website"
            name="website"
            type="url"
            maxLength={500}
            placeholder="https://"
            defaultValue={text("website")}
          />
        </Field>
        <Field name="linkedin_url" label="LinkedIn">
          <Input
            id="linkedin_url"
            name="linkedin_url"
            type="url"
            maxLength={500}
            placeholder="https://www.linkedin.com/in/"
            defaultValue={text("linkedin_url")}
          />
        </Field>
        <Field name="github_url" label="GitHub">
          <Input
            id="github_url"
            name="github_url"
            type="url"
            maxLength={500}
            placeholder="https://github.com/"
            defaultValue={text("github_url")}
          />
        </Field>
        <Field name="x_url" label="X">
          <Input
            id="x_url"
            name="x_url"
            type="url"
            maxLength={500}
            placeholder="https://x.com/"
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
            type="url"
            maxLength={500}
            placeholder="https://"
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
