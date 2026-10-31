"use client";

import Link from "@/components/link";
import { startTransition, useActionState, useState } from "react";
import { Check, ChevronDown, CircleAlert, CircleCheck, Ellipsis, ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Select } from "radix-ui";
import { disconnectProviderAction, refreshRevenueAction } from "@/app/revenue-actions";
import { LOCALE_INFO } from "@/i18n/config";
import { formatList } from "@/i18n/list";
import { formatCount, formatMoney, isConverted } from "@/lib/display-money";
import { formatDate, OTHER_PROVIDER_MAX_LENGTH, type ActionState } from "@/lib/domain";
import type { RevenueConnection, RevenueSnapshot } from "@/lib/data";
import {
  connectsWithOAuth,
  isProviderId,
  isProviderOption,
  PROVIDERS,
  providerAccount,
  providerExtra,
  providerKeyPlaceholder,
  type ProviderField,
  type ProviderId,
  type ProviderOption,
} from "@/lib/revenue/catalog";
import { STRIPE_KEY_PERMISSIONS, stripeKeyCreationUrl } from "@/lib/revenue/stripe/permissions";
import { SITE_NAME } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { Feedback, Field, Section } from "./forms";
import { LocalTime } from "./local-time";
import { useMoney } from "./money-provider";
import { ProviderLogo } from "./provider-logo";
import { Notice } from "./shell";
import { Button } from "./ui/button";
import { fieldClasses, Input } from "./ui/input";

// The words of everything below are messages: the section's in `revenue`, each provider's in
// `providers.<id>`. Providers' own buttons and permissions keep the names their dashboards show.

// Stripe's names for the resources its key reads, as its dashboard shows them.
const stripeResources = STRIPE_KEY_PERMISSIONS.map(({ resource }) => resource);

// Where each provider's key is made, or where the access a founder approved can be removed. The
// link's words are `providers.<id>.dashboard`, and the steps `step1` to `step3`.
const dashboards: Record<ProviderId, string> = {
  stripe: stripeKeyCreationUrl(SITE_NAME),
  paddle: "https://vendors.paddle.com/authentication-v2",
  polar: "https://polar.sh/dashboard",
  dodo: "https://app.dodopayments.com",
  creem: "https://creem.io/dashboard/developers",
  chargebee: "https://app.chargebee.com/login",
  whop: "https://whop.com/dashboard",
  revenuecat: "https://app.revenuecat.com",
  gumroad: "https://gumroad.com/settings/authorized_applications",
  paypal: "https://developer.paypal.com/dashboard/applications/live",
  mollie: "https://my.mollie.com/dashboard/developers/api-access-tokens",
  paystack: "https://dashboard.paystack.com",
  abacatepay: "https://app.abacatepay.com",
  asaas: "https://www.asaas.com/customerApiAccessToken/index",
  airwallex: "https://www.airwallex.com/app/settings/developer/api-keys",
  superwall: "https://app.superwall.com",
  appstore: "https://appstoreconnect.apple.com/access/integrations/api",
  googleplay: "https://console.cloud.google.com/iam-admin/serviceaccounts",
  zoho: "https://accounts.zoho.com/home#sessions/userconnectedapps",
  mercadopago: "https://www.mercadopago.com",
};

const STEPS = ["step1", "step2", "step3"] as const;

// Where to make the key, with the steps: the dashboard link opens in a new tab.
function KeyGuide({ provider }: { provider: ProviderId }) {
  const t = useTranslations("providers");
  const locale = useLocale();
  const values = {
    b: (chunks: React.ReactNode) => (
      <strong className="font-medium text-foreground">{chunks}</strong>
    ),
    permissions: formatList(stripeResources, locale),
  };
  return (
    <div className="rounded-xl border bg-subtle p-4">
      <a
        href={dashboards[provider]}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center justify-between gap-3 text-sm font-medium"
      >
        <span className="underline-offset-2 group-hover:underline">
          {t(`${provider}.dashboard`)}
        </span>
        <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </a>
      <ol className="mt-3 grid list-decimal gap-1.5 ps-5 text-sm text-muted-foreground">
        {STEPS.map((step) => (
          <li key={step}>{t.rich(`${provider}.${step}`, values)}</li>
        ))}
      </ol>
    </div>
  );
}

const option =
  "flex cursor-default items-center gap-2.5 rounded-md px-2 py-2 text-sm outline-none select-none data-highlighted:bg-muted";

/**
 * The payment providers this server can connect, with their logos, and Other last, for a provider
 * that is not supported. The choice is part of the product form, so saving the form connects the chosen
 * provider. The list is a Radix select, so a hidden field carries the choice.
 */
function ProviderChoice({
  providers,
  value,
  onChange,
  offerOther,
  required,
  invalid,
  onClear,
  clearLabel,
}: {
  /** The providers offered, in order. */
  providers: ProviderId[];
  value: ProviderOption | null;
  onChange: (provider: ProviderOption) => void;
  offerOther: boolean;
  required: boolean;
  /** Set when the form was sent without a choice. */
  invalid: boolean;
  /** Leaves the provider unchosen again; without it, nothing offers that. */
  onClear?: () => void;
  clearLabel?: string;
}) {
  const t = useTranslations("revenue.choice");
  return (
    <Field
      name="provider"
      label={t("label")}
      required={required}
      aside={
        onClear && (
          <button
            type="button"
            onClick={onClear}
            className="-my-1.5 py-1.5 text-[13px] leading-none text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {clearLabel}
          </button>
        )
      }
    >
      <Select.Root
        value={value ?? ""}
        onValueChange={(next) => {
          if (isProviderOption(next)) onChange(next);
        }}
      >
        <Select.Trigger
          id="provider"
          // Not Radix's own `required`, which would have the browser point at a hidden field; the
          // form checks the choice itself.
          aria-required={required}
          aria-invalid={invalid || undefined}
          className={cn(
            fieldClasses,
            "flex h-10 items-center gap-2.5 text-start data-placeholder:text-faint-foreground",
          )}
        >
          <Select.Value placeholder={t("placeholder")} />
          <Select.Icon className="ms-auto">
            <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={6}
            className="z-50 max-h-(--radix-select-content-available-height) w-(--radix-select-trigger-width) overflow-hidden rounded-lg border bg-surface p-1 text-foreground shadow-float"
          >
            <Select.Viewport>
              {providers.map((id) => (
                <Select.Item key={id} value={id} className={option}>
                  {/* The logo is part of the item's text, so the closed list shows it too. */}
                  <Select.ItemText>
                    <span className="flex items-center gap-2.5">
                      <ProviderLogo provider={id} />
                      {PROVIDERS[id].name}
                    </span>
                  </Select.ItemText>
                  <Select.ItemIndicator className="ms-auto">
                    <Check aria-hidden="true" className="size-4 text-muted-foreground" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
              {offerOther && (
                <>
                  <Select.Separator className="-mx-1 my-1 h-px bg-border" />
                  <Select.Item value="other" className={option}>
                    <Select.ItemText>
                      <span className="flex items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="flex size-5 shrink-0 items-center justify-center rounded-[5px] border bg-subtle"
                        >
                          <Ellipsis className="size-3.5 text-muted-foreground" />
                        </span>
                        {t("other")}
                      </span>
                    </Select.ItemText>
                    <Select.ItemIndicator className="ms-auto">
                      <Check aria-hidden="true" className="size-4 text-muted-foreground" />
                    </Select.ItemIndicator>
                  </Select.Item>
                </>
              )}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      <input type="hidden" name="provider" value={value ?? ""} />
    </Field>
  );
}

const privacyLink = (chunks: React.ReactNode) => (
  <Link href="/privacy#revenue" className="font-medium text-foreground underline">
    {chunks}
  </Link>
);

/**
 * What the chosen provider needs: the key, and the site or project for some, with the steps to
 * make it. A provider connected through OAuth needs nothing here: its approval follows the save.
 */
function ProviderFields({
  provider,
  replace,
  available,
  values,
}: {
  provider: ProviderId;
  replace: boolean;
  available: ProviderId[];
  /** What the form sent last, after a failed save. Keys are never among them. */
  values?: Record<string, string>;
}) {
  const t = useTranslations("revenue.fields");
  const providers = useTranslations("providers");
  const { name } = PROVIDERS[provider];
  const reads = providers(`${provider}.reads`);
  if (connectsWithOAuth(provider))
    return (
      <div className="grid gap-4">
        <KeyGuide provider={provider} />
        {!available.includes(provider) && (
          <Notice>{providers("notSetUp", { provider: name })}</Notice>
        )}
        <p className="text-[13px] text-muted-foreground">
          {t.rich("accessNote", { provider: name, reads, link: privacyLink })}
        </p>
      </div>
    );
  // A sample of the value, or words that say what goes in.
  const placeholder = ({ placeholder, placeholderText }: Omit<ProviderField, "label">) =>
    placeholder ?? (placeholderText && providers(`placeholders.${placeholderText}`));
  const account = providerAccount(provider);
  return (
    <div className="grid gap-4">
      <KeyGuide provider={provider} />
      {account && (
        <Field name="provider_account" label={providers(`fields.${account.label}`)}>
          <Input
            // Another provider's site or project never carries over.
            key={provider}
            id="provider_account"
            name="provider_account"
            // Ids, sites and addresses read left to right in every language.
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder(account)}
            defaultValue={values?.provider === provider ? values.provider_account : undefined}
            required
          />
        </Field>
      )}
      {providerExtra(provider).map((field, index) => {
        const name = `provider_extra_${index + 1}`;
        return (
          <Field key={name} name={name} label={providers(`fields.${field.label}`)}>
            <Input
              key={provider}
              id={name}
              name={name}
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              placeholder={placeholder(field)}
              defaultValue={values?.provider === provider ? values[name] : undefined}
              required
            />
          </Field>
        );
      })}
      <Field
        name="provider_key"
        label={providers(replace ? `${provider}.newKeyLabel` : `${provider}.keyLabel`)}
      >
        <Input
          key={provider}
          id="provider_key"
          name="provider_key"
          type="password"
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder(providerKeyPlaceholder(provider))}
          required
        />
      </Field>
      <p className="text-[13px] text-muted-foreground">
        {t.rich("keyNote", { provider: name, reads, link: privacyLink })}
      </p>
    </div>
  );
}

// What a connected provider gives that Other does not, so founders who have one connect it.
const connectedGains = ["gainLeaderboard", "gainCategories", "gainLink"] as const;

/** Other: the founder writes which provider they use, which only they and admins see. */
function OtherProviderField({ defaultValue }: { defaultValue?: string }) {
  const t = useTranslations("revenue.other");
  return (
    <div className="grid gap-4">
      <div className="rounded-xl border bg-subtle p-4">
        <p className="text-sm font-medium">{t("title")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>
        <ul className="mt-2 grid gap-1.5 text-sm text-muted-foreground">
          {connectedGains.map((gain) => (
            <li key={gain} className="flex gap-2">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
              {t(gain)}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] text-muted-foreground">{t("unverified")}</p>
      </div>
      <Field name="other_provider" label={t("label")} hint={t("hint")} required>
        <Input
          id="other_provider"
          name="other_provider"
          // The founder's own words.
          dir="auto"
          autoComplete="off"
          required
          maxLength={OTHER_PROVIDER_MAX_LENGTH}
          defaultValue={defaultValue}
        />
      </Field>
      <p className="text-[13px] text-muted-foreground">{t("note")}</p>
    </div>
  );
}

/**
 * Says that the amounts above are converted from US dollars, and at which day's rate, as
 * `ConversionNote` does on the server; nothing in US dollars.
 */
function ConvertedNote() {
  const money = useMoney();
  const t = useTranslations("money");
  if (!isConverted(money) || !money.date) return null;
  const name = new Intl.DisplayNames([money.locale], { type: "currency" }).of(money.currency);
  const date = new Intl.DateTimeFormat(money.locale, { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${money.date}T00:00:00Z`),
  );
  const currency = name && name !== money.currency ? `${name} (${money.currency})` : money.currency;
  return (
    <p className="border-t px-5 py-3 text-[13px] text-faint-foreground">
      {t("converted", { currency, date })}
    </p>
  );
}

/**
 * Revenue besides MRR as the latest snapshot has it, with where reading payments stands: they are
 * read about once a day, and a new connection's first read goes back to its first payment over a
 * few runs. Amounts are in the visitor's currency.
 */
function RevenueFigures({
  connection,
  snapshot,
}: {
  connection: RevenueConnection;
  snapshot: RevenueSnapshot | null;
}) {
  const t = useTranslations("revenue.figures");
  const money = useMoney();
  const locale = useLocale();
  const figures = [
    { label: t("last30Days"), cents: snapshot?.revenue_30d_cents ?? null },
    { label: t("last12Months"), cents: snapshot?.revenue_12m_cents ?? null },
    { label: t("allTime"), cents: snapshot?.revenue_total_cents ?? null },
  ];
  const status = connection.revenue_note
    ? connection.revenue_note
    : !connection.revenue_read_at
      ? t("firstRead")
      : !connection.revenue_origin && connection.revenue_from
        ? t("readingBack", {
            date: formatDate(connection.revenue_from, LOCALE_INFO[locale].intl),
          })
        : null;
  return (
    <div className="border-t">
      <p className="px-5 pt-4 text-sm font-medium">{t("title")}</p>
      <dl className="grid grid-cols-3 divide-x">
        {figures.map(({ label, cents }) => (
          <div key={label} className="px-5 py-3">
            <dt className="text-[13px] text-muted-foreground">{label}</dt>
            <dd
              className={cn(
                "mt-1 tabular-nums",
                cents == null ? "text-sm text-faint-foreground" : "text-lg font-semibold",
              )}
            >
              {cents == null ? t("notRead") : formatMoney(cents, money)}
            </dd>
          </div>
        ))}
      </dl>
      {status && (
        <p
          className={cn(
            "border-t px-5 py-3 text-[13px] [overflow-wrap:anywhere]",
            connection.revenue_note ? "text-error" : "text-muted-foreground",
          )}
        >
          {status}
        </p>
      )}
    </div>
  );
}

// Inside the product form, so refreshing and disconnecting are buttons that call their actions
// rather than forms of their own.
function Connected({
  saasId,
  connection,
  snapshot,
  outcome,
  onOutcome,
}: {
  saasId: string;
  connection: RevenueConnection;
  snapshot: RevenueSnapshot | null;
  /** The result of a disconnection, kept by the section. */
  outcome: ActionState;
  onOutcome: (result: ActionState) => void;
}) {
  const t = useTranslations("revenue.connected");
  const common = useTranslations("common");
  const providers = useTranslations("providers");
  const money = useMoney();
  const [refreshState, refresh, refreshing] = useActionState<ActionState>(async () => {
    onOutcome({});
    return refreshRevenueAction(saasId);
  }, {});
  // Disconnecting removes this card once the page has caught up, so its result goes to the section.
  const [disconnectState, disconnect, disconnecting] = useActionState<ActionState>(async () => {
    onOutcome({});
    const result = await disconnectProviderAction(saasId);
    if (result.success) onOutcome(result);
    return result;
  }, {});
  const [confirming, setConfirming] = useState(false);
  const ok = connection.status === "ok";
  const provider = isProviderId(connection.provider) ? connection.provider : "stripe";
  // A provider connected through OAuth gave access the founder approved, not a key they pasted.
  const oauth = connectsWithOAuth(provider);
  const hint = connection.key_hint;
  const synced = connection.last_synced_at;
  return (
    <div className="grid gap-4">
      <div className="rounded-xl border bg-surface shadow-card">
        <div className="flex items-start gap-3 p-5">
          {ok ? (
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" />
          ) : (
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-error" />
          )}
          <div className="min-w-0">
            <p className="font-medium">
              {ok ? t("title", { provider: PROVIDERS[provider].name }) : t("failed")}
              {!connection.livemode && (
                <span className="ms-2 rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">
                  {t("testMode")}
                </span>
              )}
            </p>
            <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {oauth ? t("access", { hint }) : t("key", { hint })}
              {synced && (
                <>
                  {" · "}
                  {t.rich("lastVerified", {
                    date: () => <LocalTime format="date" value={synced} />,
                  })}
                </>
              )}
            </p>
            {!ok && connection.last_error && (
              <p className="mt-1 text-sm text-error">{connection.last_error}</p>
            )}
          </div>
        </div>
        {snapshot && (
          <dl className="grid grid-cols-2 divide-x border-t">
            <div className="px-5 py-4">
              <dt className="text-sm text-muted-foreground">{common("verifiedMrr")}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {formatMoney(snapshot.mrr_cents, money)}
              </dd>
            </div>
            <div className="px-5 py-4">
              <dt className="text-sm text-muted-foreground">{t("subscribers")}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {formatCount(snapshot.customers, money.locale)}
              </dd>
            </div>
          </dl>
        )}
        {snapshot && !snapshot.history && (
          <p className="border-t px-5 py-3 text-[13px] text-muted-foreground">
            {providers(`${provider}.noHistory`)}
          </p>
        )}
        <RevenueFigures connection={connection} snapshot={snapshot} />
        {/* The amounts above are in the visitor's currency. */}
        {snapshot && <ConvertedNote />}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t p-4">
          <Button
            type="button"
            size="sm"
            disabled={refreshing}
            onClick={() => startTransition(refresh)}
          >
            {refreshing ? t("refreshing") : t("refresh")}
          </Button>
          {confirming ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                {t("keepConnected")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={disconnecting}
                onClick={() => startTransition(disconnect)}
              >
                {disconnecting ? t("disconnecting") : t("confirmDisconnect")}
              </Button>
            </>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
              {t("disconnect")}
            </Button>
          )}
        </div>
      </div>
      <Feedback state={outcome} />
      <Feedback state={refreshState} />
      <Feedback state={disconnectState} />
    </div>
  );
}

/**
 * The payment provider as the first section of the product form. A product that is not connected
 * needs a choice: a provider from the list, whose key saving the form verifies, or Other, with the
 * name of the founder's provider. A connected product shows its figures here, with a way to
 * replace the key.
 */
export function RevenueSection({
  saasId,
  connection,
  snapshot,
  available,
  allowOtherProvider,
  result,
  provider,
  onProvider,
  invalid,
  otherProvider,
  values,
  children,
}: {
  saasId: string;
  connection: RevenueConnection | null;
  snapshot: RevenueSnapshot | null;
  /** The providers this server can connect, which the list offers. */
  available: ProviderId[];
  allowOtherProvider: boolean;
  /** How the last connection went, in words for the founder. */
  result: { tone: "success" | "error"; text: string } | null;
  provider: ProviderOption | null;
  onProvider: (provider: ProviderOption | null) => void;
  /** Set when the form was sent without a choice. */
  invalid: boolean;
  /** The name saved under Other, if any. */
  otherProvider: string | null;
  /** What the form sent last, after a failed save. */
  values?: Record<string, string>;
  /** What visitors see of the figures. */
  children: React.ReactNode;
}) {
  const t = useTranslations("revenue");
  // What a disconnection found. The card that did it is replaced as soon as the page has the
  // change, so the result is kept here.
  const [outcome, setOutcome] = useState<ActionState>({});
  // A replacement that failed comes back with its provider chosen, so its fields stay open.
  const [replacing, setReplacing] = useState(() => !!connection && provider !== null);
  const current = connection && isProviderId(connection.provider) ? connection.provider : null;
  return (
    <Section
      id="revenue"
      title={t("section.title")}
      description={t(allowOtherProvider ? "section.description" : "section.requiredDescription")}
    >
      {result && <Notice tone={result.tone}>{result.text}</Notice>}
      {connection ? (
        <>
          <Connected
            saasId={saasId}
            connection={connection}
            snapshot={snapshot}
            outcome={outcome}
            onOutcome={setOutcome}
          />
          {replacing ? (
            <div className="grid gap-4">
              <ProviderChoice
                providers={available}
                value={provider}
                onChange={onProvider}
                offerOther={false}
                required={false}
                invalid={false}
                onClear={() => {
                  onProvider(null);
                  setReplacing(false);
                }}
                clearLabel={t("choice.keepCurrent")}
              />
              {provider && provider !== "other" && (
                <ProviderFields provider={provider} replace available={available} values={values} />
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setReplacing(true)}
              className="w-fit text-start text-sm text-muted-foreground hover:text-foreground"
            >
              {current && connectsWithOAuth(current) ? t("choice.reconnect") : t("choice.replace")}
            </button>
          )}
        </>
      ) : (
        <div className="grid gap-4">
          <Feedback state={outcome} />
          <ProviderChoice
            providers={available}
            value={provider}
            onChange={onProvider}
            offerOther={allowOtherProvider}
            required
            invalid={invalid}
          />
          {provider === "other" ? (
            <OtherProviderField
              defaultValue={
                values?.provider === "other" ? values.other_provider : (otherProvider ?? undefined)
              }
            />
          ) : (
            provider && (
              <ProviderFields
                provider={provider}
                replace={false}
                available={available}
                values={values}
              />
            )
          )}
        </div>
      )}
      {children}
    </Section>
  );
}
