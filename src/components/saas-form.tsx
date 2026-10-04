"use client";

import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import { saveSaas, type SaveSaasState } from "@/app/actions";
import type { RevenueConnection, RevenueSnapshot, Saas, SaasSettings } from "@/lib/data";
import { categories } from "@/lib/domain";
import { connectsWithOAuth, PROVIDERS, type ProviderId } from "@/lib/revenue/catalog";
import { TECH_STACK_MAX, techGroups, technologies } from "@/lib/tech";
import { cn } from "@/lib/utils";
import { Actions, Feedback, Field, ImageField, Section, Share, Submit } from "./forms";
import { RevenueSection } from "./revenue-connection";
import { Button } from "./ui/button";
import { Input, fieldClasses } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { useEditorAction } from "./use-editor-action";

/**
 * The technologies a product is built with, one checkbox each, in groups that open when something
 * in them is ticked. `key` mounts the boxes again after a failed save, so they show what was sent.
 */
function TechStackField({ stack }: { stack: string[] }) {
  const chosen = new Set(stack);
  return (
    <div key={stack.join()} className="grid gap-2">
      {techGroups.map((group) => {
        const items = technologies.filter((tech) => tech.group === group);
        return (
          <details
            key={group}
            open={items.some((tech) => chosen.has(tech.slug))}
            className="group rounded-lg border bg-surface shadow-control"
          >
            <summary className="cursor-pointer rounded-lg px-4 py-2.5 text-sm font-medium select-none hover:bg-subtle">
              {group}
            </summary>
            <fieldset className="flex flex-wrap gap-1.5 border-t px-4 py-3">
              <legend className="sr-only">{group}</legend>
              {items.map((tech) => (
                <label
                  key={tech.slug}
                  className="flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-[13px] text-muted-foreground has-checked:border-foreground has-checked:text-foreground"
                >
                  <input
                    type="checkbox"
                    name="tech"
                    value={tech.slug}
                    defaultChecked={chosen.has(tech.slug)}
                    className="size-3.5 accent-brand"
                  />
                  {tech.name}
                </label>
              ))}
            </fieldset>
          </details>
        );
      })}
    </div>
  );
}

// What the save button does, in its own words: saving alone, or connecting the chosen provider too.
function submitLabel(isNew: boolean, provider: ProviderId | null) {
  if (!provider) return isNew ? "Add SaaS" : "Save changes";
  const save = isNew ? "Add SaaS" : "Save";
  return connectsWithOAuth(provider)
    ? `${save} and connect ${PROVIDERS[provider].name}`
    : `${save} and verify revenue`;
}

/**
 * Everything about a product in one form, revenue verification included: the details, the logo
 * and the tech stack, then the payment provider, which is optional. One save does it all.
 */
export function SaasForm({
  id,
  saas,
  settings,
  connection = null,
  snapshot = null,
  oauthReady,
  result = null,
}: {
  id: string;
  saas?: Saas;
  settings?: SaasSettings | null;
  connection?: RevenueConnection | null;
  snapshot?: RevenueSnapshot | null;
  /** The providers connected through OAuth that this server is set up for. */
  oauthReady: ProviderId[];
  /** How connecting this product's provider last went. */
  result?: { provider: ProviderId; tone: "success" | "error"; text: string } | null;
}) {
  const [state, action, pending] = useEditorAction<SaveSaasState>(saveSaas);
  // A key the provider refused comes back with its provider chosen, ready for another key.
  const [provider, setProvider] = useState<ProviderId | null>(
    result?.tone === "error" && !connectsWithOAuth(result.provider) ? result.provider : null,
  );
  useEffect(() => {
    // Approving access through OAuth starts with a plain navigation once the product is saved.
    if (state.location) window.location.assign(state.location);
    // The save button is at the end of the form, so a refused key brings its section into view.
    if (state.connectionError) document.getElementById("revenue")?.scrollIntoView();
  }, [state]);
  const shown = state.connectionError
    ? { tone: "error" as const, text: state.connectionError }
    : result;
  // Figures are public unless hidden, so a new product starts with every box clear.
  const hidden = (key: "revenue" | "customers" | "launch") =>
    state.values ? !!state.values[`hide_${key}`] : settings ? !settings[`share_${key}`] : false;
  const stack = state.values ? (state.values.tech?.split("\n") ?? []) : (saas?.tech_stack ?? []);
  const verifying = !!provider && !connectsWithOAuth(provider);
  return (
    // Submitted from onSubmit rather than the action prop, so React does not reset the form after
    // a failed save: a reset would clear a chosen logo, the remove box and a pasted key, which no
    // saved value brings back. A successful save leaves the page.
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Section
        title="Product"
        description="Shown on the public product page and in listings. Fields marked * are required."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="name" label="Product name" required>
            <Input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={80}
              defaultValue={state.values?.name ?? saas?.name}
            />
          </Field>
          <Field name="category" label="Category" required>
            {/* No category is chosen for the founder, so a new product does not land in one by
                default. */}
            <select
              id="category"
              name="category"
              required
              defaultValue={state.values?.category ?? saas?.category ?? ""}
              className={cn(fieldClasses, "h-10")}
            >
              <option value="" disabled>
                Choose a category
              </option>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field name="tagline" label="Tagline" hint="One sentence, up to 140 characters." required>
          <Input
            id="tagline"
            name="tagline"
            required
            minLength={5}
            maxLength={140}
            defaultValue={state.values?.tagline ?? saas?.tagline}
            placeholder="What does it help people do?"
          />
        </Field>
        <Field name="description" label="Description" required>
          <Textarea
            id="description"
            name="description"
            required
            minLength={20}
            maxLength={5000}
            rows={6}
            defaultValue={state.values?.description ?? saas?.description}
            placeholder="Who it is for, what it does, and what makes it different."
          />
        </Field>
        <Field name="website" label="Website" required>
          {/* Text rather than url, so example.com is taken; the server adds https://. */}
          <Input
            id="website"
            name="website"
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={500}
            defaultValue={state.values?.website ?? saas?.website}
            placeholder="example.com"
          />
        </Field>
        <div className="grid gap-2.5 sm:max-w-xs">
          <Field name="launched_on" label="Launch date">
            <Input
              id="launched_on"
              name="launched_on"
              type="date"
              defaultValue={state.values?.launched_on ?? settings?.launched_on ?? ""}
            />
          </Field>
          <Share name="hide_launch" label="Hide launch date" checked={hidden("launch")} />
        </div>
      </Section>
      <Section title="Logo" description="A square logo works best.">
        <ImageField label="Upload logo" current={saas?.logo_path} name={saas?.name ?? ""} />
      </Section>
      <Section
        title="Tech stack"
        description={`What the product is built with, up to ${TECH_STACK_MAX}. Shown on its page, with links to other products built with the same.`}
      >
        <TechStackField stack={stack} />
      </Section>
      <RevenueSection
        saasId={id}
        connection={connection}
        snapshot={snapshot}
        oauthReady={oauthReady}
        result={shown}
        provider={provider}
        onProvider={setProvider}
        values={state.values}
      >
        <div role="group" aria-labelledby="figures-title" className="grid gap-2.5 border-t pt-5">
          <div>
            <p id="figures-title" className="text-sm font-medium">
              Public figures
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Verified figures are public unless you hide them. Public revenue is ranked on the
              leaderboard, by MRR and by revenue over 30 days, 12 months and all time.
            </p>
          </div>
          <Share
            name="hide_revenue"
            label="Hide verified revenue, MRR included"
            checked={hidden("revenue")}
          />
          <Share
            name="hide_customers"
            label="Hide subscriber count"
            checked={hidden("customers")}
          />
        </div>
      </RevenueSection>
      <div className="mb-4 empty:hidden">
        <Feedback state={state} />
      </div>
      {/* A direct child of the form, so it stays in view while the form is and saving never needs
          a search below it. */}
      <Actions sticky>
        <Button asChild variant="ghost">
          <Link href="/dashboard">Cancel</Link>
        </Button>
        <Submit
          pending={pending || !!state.location}
          pendingLabel={verifying ? "Verifying revenue..." : "Saving..."}
        >
          {submitLabel(!saas, provider)}
        </Submit>
      </Actions>
    </form>
  );
}
