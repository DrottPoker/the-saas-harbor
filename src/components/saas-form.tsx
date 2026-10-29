"use client";

import Link from "@/components/link";
import { startTransition, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { saveSaas, type SaveSaasState } from "@/app/actions";
import { categoryKey, techGroupKey } from "@/i18n/names";
import type { RevenueConnection, RevenueSnapshot, Saas, SaasSettings } from "@/lib/data";
import { categories } from "@/lib/domain";
import {
  connectsWithOAuth,
  PROVIDERS,
  type ProviderId,
  type ProviderOption,
} from "@/lib/revenue/catalog";
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
  const t = useTranslations("tech");
  const chosen = new Set(stack);
  return (
    <div key={stack.join()} className="grid gap-2">
      {techGroups.map((group) => {
        const items = technologies.filter((tech) => tech.group === group);
        const name = t(techGroupKey(group));
        return (
          <details
            key={group}
            open={items.some((tech) => chosen.has(tech.slug))}
            className="group rounded-lg border bg-surface shadow-control"
          >
            <summary className="cursor-pointer rounded-lg px-4 py-2.5 text-sm font-medium select-none hover:bg-subtle">
              {name}
            </summary>
            <fieldset className="flex flex-wrap gap-1.5 border-t px-4 py-3">
              <legend className="sr-only">{name}</legend>
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
function useSubmitLabel(isNew: boolean, provider: ProviderOption | null) {
  const t = useTranslations("saasForm.actions");
  if (!provider || provider === "other") return isNew ? t("add") : t("save");
  if (connectsWithOAuth(provider))
    return t(isNew ? "addAndConnect" : "saveAndConnect", { provider: PROVIDERS[provider].name });
  return isNew ? t("addAndVerify") : t("saveAndVerify");
}

/**
 * Everything about a product in one form, revenue verification included: the payment provider
 * first, which every product names, then the details, the logo and the tech stack. One save does
 * it all.
 */
export function SaasForm({
  id,
  saas,
  settings,
  connection = null,
  snapshot = null,
  available,
  result = null,
}: {
  id: string;
  saas?: Saas;
  settings?: SaasSettings | null;
  connection?: RevenueConnection | null;
  snapshot?: RevenueSnapshot | null;
  /** The providers this server can connect, which the form offers. */
  available: ProviderId[];
  /** How connecting this product's provider last went. */
  result?: { provider: ProviderId; tone: "success" | "error"; text: string } | null;
}) {
  const t = useTranslations("saasForm");
  const categoryName = useTranslations("categories");
  const [state, action, pending] = useEditorAction<SaveSaasState>(saveSaas);
  // A key the provider refused comes back with its provider chosen, ready for another key, and a
  // product saved under Other with Other chosen.
  const [provider, setProvider] = useState<ProviderOption | null>(() => {
    if (result?.tone === "error" && !connectsWithOAuth(result.provider)) return result.provider;
    return !connection && settings?.other_provider ? "other" : null;
  });
  // Set when the form was sent without a provider, until one is chosen.
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    // Approving access through OAuth starts with a plain navigation once the product is saved.
    if (state.location) window.location.assign(state.location);
    // The save button is at the end of the form, so a refused key brings its section into view.
    if (state.connectionError) document.getElementById("revenue")?.scrollIntoView();
  }, [state]);
  const shown = missing
    ? { tone: "error" as const, text: t("chooseProvider") }
    : state.connectionError
      ? { tone: "error" as const, text: state.connectionError }
      : result;
  // Figures are public unless hidden, so a new product starts with every box clear.
  const hidden = (key: "revenue" | "customers" | "launch") =>
    state.values ? !!state.values[`hide_${key}`] : settings ? !settings[`share_${key}`] : false;
  const stack = state.values ? (state.values.tech?.split("\n") ?? []) : (saas?.tech_stack ?? []);
  const verifying = !!provider && provider !== "other" && !connectsWithOAuth(provider);
  const submitLabel = useSubmitLabel(!saas, provider);
  return (
    // Submitted from onSubmit rather than the action prop, so React does not reset the form after
    // a failed save: a reset would clear a chosen logo, the remove box and a pasted key, which no
    // saved value brings back. A successful save leaves the page.
    <form
      onSubmit={(event) => {
        event.preventDefault();
        // The server checks this too; here it saves a round trip and goes back to the list.
        if (!connection && !provider) {
          setMissing(true);
          document.getElementById("revenue")?.scrollIntoView();
          document.getElementById("provider")?.focus({ preventScroll: true });
          return;
        }
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <input type="hidden" name="id" value={id} />
      <RevenueSection
        saasId={id}
        connection={connection}
        snapshot={snapshot}
        available={available}
        result={shown}
        provider={provider}
        onProvider={(next) => {
          setProvider(next);
          setMissing(false);
        }}
        invalid={missing}
        otherProvider={settings?.other_provider ?? null}
        values={state.values}
      >
        {/* Hidden rather than removed under Other, so saving keeps what the founder chose. */}
        <div
          role="group"
          aria-labelledby="figures-title"
          className={cn("grid gap-2.5 border-t pt-5", provider === "other" && "hidden")}
        >
          <div>
            <p id="figures-title" className="text-sm font-medium">
              {t("figures.title")}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("figures.description")}</p>
          </div>
          <Share name="hide_revenue" label={t("figures.hideRevenue")} checked={hidden("revenue")} />
          <Share
            name="hide_customers"
            label={t("figures.hideCustomers")}
            checked={hidden("customers")}
          />
        </div>
      </RevenueSection>
      <Section title={t("details.title")} description={t("details.description")}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="name" label={t("details.name")} required>
            <Input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={80}
              defaultValue={state.values?.name ?? saas?.name}
              dir="auto"
            />
          </Field>
          <Field name="category" label={t("details.category")} required>
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
                {t("details.chooseCategory")}
              </option>
              {/* The stored value stays the English name; the list shows it in the page's language. */}
              {categories.map((category) => (
                <option key={category} value={category}>
                  {categoryName(categoryKey(category))}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field name="tagline" label={t("details.tagline")} hint={t("details.taglineHint")} required>
          <Input
            id="tagline"
            name="tagline"
            required
            minLength={5}
            maxLength={140}
            defaultValue={state.values?.tagline ?? saas?.tagline}
            placeholder={t("details.taglinePlaceholder")}
            dir="auto"
          />
        </Field>
        <Field name="description" label={t("details.productDescription")} required>
          <Textarea
            id="description"
            name="description"
            required
            minLength={20}
            maxLength={5000}
            rows={6}
            defaultValue={state.values?.description ?? saas?.description}
            placeholder={t("details.descriptionPlaceholder")}
            dir="auto"
          />
        </Field>
        <Field name="website" label={t("details.website")} required>
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
            dir="ltr"
          />
        </Field>
        <div className="grid gap-2.5 sm:max-w-xs">
          <Field name="launched_on" label={t("details.launchDate")} required>
            <Input
              id="launched_on"
              name="launched_on"
              type="date"
              required
              defaultValue={state.values?.launched_on ?? settings?.launched_on ?? ""}
            />
          </Field>
          <Share name="hide_launch" label={t("details.hideLaunch")} checked={hidden("launch")} />
        </div>
      </Section>
      <Section title={t("logo.title")} description={t("logo.description")}>
        <ImageField label={t("logo.upload")} current={saas?.logo_path} name={saas?.name ?? ""} />
      </Section>
      <Section title={t("tech.title")} description={t("tech.description", { max: TECH_STACK_MAX })}>
        <TechStackField stack={stack} />
      </Section>
      <div className="mb-4 empty:hidden">
        <Feedback state={state} />
      </div>
      {/* A direct child of the form, so it stays in view while the form is and saving never needs
          a search below it. */}
      <Actions sticky>
        <Button asChild variant="ghost">
          <Link href="/dashboard">{t("actions.cancel")}</Link>
        </Button>
        <Submit
          pending={pending || !!state.location}
          pendingLabel={verifying ? t("actions.verifying") : t("actions.saving")}
        >
          {submitLabel}
        </Submit>
      </Actions>
    </form>
  );
}
