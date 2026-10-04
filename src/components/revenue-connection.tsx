"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { Check, ChevronDown, CircleAlert, CircleCheck, ExternalLink } from "lucide-react";
import { Select } from "radix-ui";
import { disconnectProviderAction, refreshRevenueAction } from "@/app/revenue-actions";
import { formatDate, formatUsd, type ActionState } from "@/lib/domain";
import type { RevenueConnection, RevenueSnapshot } from "@/lib/data";
import {
  connectsWithOAuth,
  isProviderId,
  PROVIDER_IDS,
  PROVIDERS,
  providerAccount,
  type ProviderId,
} from "@/lib/revenue/catalog";
import { STRIPE_KEY_PERMISSIONS, stripeKeyCreationUrl } from "@/lib/revenue/stripe/key";
import { SITE_NAME } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { Feedback, Field, Section } from "./forms";
import { ProviderLogo } from "./provider-logo";
import { Notice } from "./shell";
import { Button } from "./ui/button";
import { fieldClasses, Input } from "./ui/input";

const resources = STRIPE_KEY_PERMISSIONS.map(({ resource }) => resource);
const permissionList = `${resources.slice(0, -1).join(", ")} and ${resources.at(-1)}`;

const strong = (text: string) => <strong className="font-medium text-foreground">{text}</strong>;

type Guide = {
  /** Where the key is made, and the link's words. */
  dashboard: { href: string; label: string };
  steps: React.ReactNode[];
  /** What the key is used to read. */
  reads: string;
};

// How to create a read-only key with each provider.
const guides: Record<ProviderId, Guide> = {
  stripe: {
    dashboard: {
      href: stripeKeyCreationUrl(SITE_NAME),
      label: "Create a read-only key in Stripe",
    },
    reads: "subscriptions, invoices, charges, Checkout Sessions and disputes",
    steps: [
      "Stripe opens a new restricted key with its name and permissions filled in.",
      <>
        Check that {strong("Read")} is set for {permissionList} and None for everything else, then
        choose {strong("Create key")}.
      </>,
      "Copy the key, which starts with rk_live_, and paste it below.",
    ],
  },
  paddle: {
    dashboard: {
      href: "https://vendors.paddle.com/authentication-v2",
      label: "Open Paddle's API keys",
    },
    reads: "subscriptions and transactions",
    steps: [
      <>Under Developer tools → Authentication, choose {strong("New API key")}.</>,
      <>
        Give it {strong("Read")} for Subscriptions and Transactions and no other permissions. Leave
        the expiry date empty, or the key stops working when it expires.
      </>,
      "Copy the key, which starts with pdl_live_apikey_, and paste it below.",
    ],
  },
  polar: {
    dashboard: { href: "https://polar.sh/dashboard", label: "Open the Polar dashboard" },
    reads: "your organization, subscriptions and orders",
    steps: [
      <>In your organization&apos;s Settings → Developers, choose {strong("New Token")}.</>,
      <>
        Select the scopes organizations:read, subscriptions:read and orders:read and nothing else,
        and choose {strong("No expiration")}.
      </>,
      "Copy the token, which starts with polar_oat_, and paste it below.",
    ],
  },
  dodo: {
    dashboard: { href: "https://app.dodopayments.com", label: "Open the Dodo Payments dashboard" },
    reads: "subscriptions and payments",
    steps: [
      <>Under Developer → API Keys, choose {strong("Add API Key")}.</>,
      <>Turn off {strong("Enable write access")}, so the key can only read.</>,
      "Copy the key, which Dodo Payments shows only once, and paste it below.",
    ],
  },
  creem: {
    dashboard: {
      href: "https://creem.io/dashboard/developers",
      label: "Open Creem's developer settings",
    },
    reads: "products, subscriptions and transactions",
    steps: [
      <>Under Developers → API keys, create a new key.</>,
      <>
        In the scope picker, give it {strong("read")} access to products, subscriptions and
        transactions and nothing else.
      </>,
      "Copy the key, which starts with creem_, and paste it below.",
    ],
  },
  chargebee: {
    dashboard: { href: "https://app.chargebee.com/login", label: "Sign in to Chargebee" },
    reads: "subscriptions, invoices and refunds",
    steps: [
      <>
        Open Settings → Configure Chargebee → API keys and events, and choose{" "}
        {strong("Add API key")}.
      </>,
      <>
        Choose a {strong("Read-only key")} with access to all data, or restricted to transactional
        data.
      </>,
      "Copy the key, and enter your site: the name before .chargebee.com in your dashboard's address.",
    ],
  },
  whop: {
    dashboard: { href: "https://whop.com/dashboard", label: "Open the Whop dashboard" },
    reads: "memberships, plans, promo codes and payments",
    steps: [
      <>
        Choose your business, open Developer → Account API keys and create a key with custom
        permissions.
      </>,
      <>
        Give it only member:basic:read, plan:basic:read, payment:basic:read and
        promo_code:basic:read. A key with any permission beyond reading is refused.
      </>,
      "Copy the key and paste it below.",
    ],
  },
  revenuecat: {
    dashboard: { href: "https://app.revenuecat.com", label: "Open the RevenueCat dashboard" },
    reads: "your project's MRR, active subscriptions and revenue charts",
    steps: [
      <>
        In your project, open Project settings → API keys and choose {strong("New secret API key")}{" "}
        with version V2.
      </>,
      <>
        Set Charts & metrics to {strong("Read only")} and everything else to No access. A key with
        more access is refused.
      </>,
      "Copy the key, which starts with sk_, and the project ID, which follows /projects/ in the address of any page in your project.",
    ],
  },
  gumroad: {
    dashboard: {
      href: "https://gumroad.com/settings/authorized_applications",
      label: "See the apps connected to your Gumroad account",
    },
    reads: "your products, memberships and sales",
    steps: [
      "Save with the button at the end of the form. Gumroad opens, and asks you to sign in if you are not.",
      <>
        Approve {strong("View your sales")}. That is the only access asked for: it cannot change
        products, refund sales or email your customers.
      </>,
      "Gumroad sends you back here, and the revenue is verified.",
    ],
  },
};

// Where to make the key, with the steps: the dashboard link opens in a new tab.
function KeyGuide({ guide }: { guide: Guide }) {
  return (
    <div className="rounded-xl border bg-subtle p-4">
      <a
        href={guide.dashboard.href}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center justify-between gap-3 text-sm font-medium"
      >
        <span className="underline-offset-2 group-hover:underline">{guide.dashboard.label}</span>
        <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </a>
      <ol className="mt-3 grid list-decimal gap-1.5 pl-5 text-sm text-muted-foreground">
        {guide.steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

// Why a connected product has no chart, in each provider's terms.
const noHistory: Record<ProviderId, string> = {
  stripe:
    "No revenue history yet. Replace the key with one that also has Invoices: Read to show the last 12 months as a chart.",
  paddle:
    "No revenue history: the Paddle account has more transactions than one verification reads.",
  polar: "No revenue history: the Polar account has more orders than one verification reads.",
  dodo: "No revenue history: Dodo Payments does not say which period a payment covers.",
  creem: "No revenue history: the Creem account has more transactions than one verification reads.",
  chargebee:
    "No revenue history: the Chargebee site has more invoices than one verification reads.",
  whop: "No revenue history: the Whop account has more payments or plans than one verification reads.",
  revenuecat: "No revenue history yet. Refresh to read RevenueCat's MRR chart.",
  gumroad: "No revenue history: the Gumroad account has more sales than one verification reads.",
};

/**
 * The payment providers to choose from, with their logos. The choice is part of the product form,
 * so saving the form connects the chosen provider; with none chosen, the form saves the product
 * alone. The list is a Radix select, so a hidden field carries the choice.
 */
function ProviderChoice({
  value,
  onChange,
  onClear,
  clearLabel,
}: {
  value: ProviderId | null;
  onChange: (provider: ProviderId) => void;
  /** Leaves the provider unchosen again; without it, nothing offers that. */
  onClear?: () => void;
  clearLabel: string;
}) {
  return (
    <Field
      name="provider"
      label="Payment provider"
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
          if (isProviderId(next)) onChange(next);
        }}
      >
        <Select.Trigger
          id="provider"
          className={cn(
            fieldClasses,
            "flex h-10 items-center gap-2.5 text-left data-placeholder:text-faint-foreground",
          )}
        >
          <Select.Value placeholder="Choose your payment provider" />
          <Select.Icon className="ml-auto">
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
              {PROVIDER_IDS.map((id) => (
                <Select.Item
                  key={id}
                  value={id}
                  className="flex cursor-default items-center gap-2.5 rounded-md px-2 py-2 text-sm outline-none select-none data-highlighted:bg-muted"
                >
                  {/* The logo is part of the item's text, so the closed list shows it too. */}
                  <Select.ItemText>
                    <span className="flex items-center gap-2.5">
                      <ProviderLogo provider={id} />
                      {PROVIDERS[id].name}
                    </span>
                  </Select.ItemText>
                  <Select.ItemIndicator className="ml-auto">
                    <Check aria-hidden="true" className="size-4 text-muted-foreground" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      <input type="hidden" name="provider" value={value ?? ""} />
    </Field>
  );
}

const privacyLink = (
  <Link href="/privacy#revenue" className="font-medium text-foreground underline">
    How we handle payment provider data
  </Link>
);

/**
 * What the chosen provider needs: the key, and the site or project for some, with the steps to
 * make it. A provider connected through OAuth needs nothing here: its approval follows the save.
 */
function ProviderFields({
  provider,
  replace,
  oauthReady,
  values,
}: {
  provider: ProviderId;
  replace: boolean;
  oauthReady: ProviderId[];
  /** What the form sent last, after a failed save. Keys are never among them. */
  values?: Record<string, string>;
}) {
  const { name, keyLabel, newKeyLabel, placeholder } = PROVIDERS[provider];
  const guide = guides[provider];
  if (connectsWithOAuth(provider))
    return (
      <div className="grid gap-4">
        <KeyGuide guide={guide} />
        {!oauthReady.includes(provider) && (
          <Notice>{name} is not set up on this server yet.</Notice>
        )}
        <p className="text-[13px] text-muted-foreground">
          The access {name} grants is encrypted and only used to read {guide.reads}. You can remove
          it in {name} at any time. {privacyLink}
        </p>
      </div>
    );
  const account = providerAccount(provider);
  return (
    <div className="grid gap-4">
      <KeyGuide guide={guide} />
      {account && (
        <Field name="provider_account" label={account.label}>
          <Input
            // Another provider's site or project never carries over.
            key={provider}
            id="provider_account"
            name="provider_account"
            autoComplete="off"
            spellCheck={false}
            placeholder={account.placeholder}
            defaultValue={values?.provider === provider ? values.provider_account : undefined}
            required
          />
        </Field>
      )}
      <Field name="provider_key" label={replace ? newKeyLabel : keyLabel}>
        <Input
          key={provider}
          id="provider_key"
          name="provider_key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          required
        />
      </Field>
      <p className="text-[13px] text-muted-foreground">
        The key is encrypted and only used to read {guide.reads}. You can revoke it in {name} at any
        time. {privacyLink}
      </p>
    </div>
  );
}

/**
 * Revenue besides MRR as the latest snapshot has it, with where reading payments stands: they are
 * read about once a day, and a new connection's first read goes back to its first payment over a
 * few runs.
 */
function RevenueFigures({
  connection,
  snapshot,
}: {
  connection: RevenueConnection;
  snapshot: RevenueSnapshot | null;
}) {
  const figures = [
    { label: "Last 30 days", cents: snapshot?.revenue_30d_cents ?? null },
    { label: "Last 12 months", cents: snapshot?.revenue_12m_cents ?? null },
    { label: "All time", cents: snapshot?.revenue_total_cents ?? null },
  ];
  const status = connection.revenue_note
    ? connection.revenue_note
    : !connection.revenue_read_at
      ? "Payments are read shortly after connecting, and then every day."
      : !connection.revenue_origin && connection.revenue_from
        ? `Older payments are still being read. So far they go back to ${formatDate(connection.revenue_from)}.`
        : null;
  return (
    <div className="border-t">
      <p className="px-5 pt-4 text-sm font-medium">Revenue, one-time purchases included</p>
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
              {cents == null ? "Not read yet" : formatUsd(cents)}
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
              {ok ? `Connected to ${PROVIDERS[provider].name}` : "The last verification failed"}
              {!connection.livemode && (
                <span className="ml-2 rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">
                  Test mode
                </span>
              )}
            </p>
            <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {oauth ? "Read access" : "Key"} {connection.key_hint}
              {connection.last_synced_at &&
                ` · Last verified ${formatDate(connection.last_synced_at)}`}
            </p>
            {!ok && connection.last_error && (
              <p className="mt-1 text-sm text-error">{connection.last_error}</p>
            )}
          </div>
        </div>
        {snapshot && (
          <dl className="grid grid-cols-2 divide-x border-t">
            <div className="px-5 py-4">
              <dt className="text-sm text-muted-foreground">Verified MRR</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {formatUsd(snapshot.mrr_cents)}
              </dd>
            </div>
            <div className="px-5 py-4">
              <dt className="text-sm text-muted-foreground">Subscribers</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {snapshot.customers.toLocaleString("en-US")}
              </dd>
            </div>
          </dl>
        )}
        {snapshot && !snapshot.history && (
          <p className="border-t px-5 py-3 text-[13px] text-muted-foreground">
            {noHistory[provider]}
          </p>
        )}
        <RevenueFigures connection={connection} snapshot={snapshot} />
        <div className="flex flex-wrap items-center justify-end gap-2 border-t p-4">
          <Button
            type="button"
            size="sm"
            disabled={refreshing}
            onClick={() => startTransition(refresh)}
          >
            {refreshing ? "Refreshing..." : "Refresh now"}
          </Button>
          {confirming ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Keep connected
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={disconnecting}
                onClick={() => startTransition(disconnect)}
              >
                {disconnecting ? "Disconnecting..." : "Confirm disconnect"}
              </Button>
            </>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
              Disconnect
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
 * Revenue verification as a section of the product form, right after the product's details. It
 * is optional: choosing a provider and pasting its key makes saving the form verify the revenue
 * too. A connected product shows its figures here, with a way to replace the key.
 */
export function RevenueSection({
  saasId,
  connection,
  snapshot,
  oauthReady,
  result,
  provider,
  onProvider,
  values,
  children,
}: {
  saasId: string;
  connection: RevenueConnection | null;
  snapshot: RevenueSnapshot | null;
  /** The providers connected through OAuth that this server is set up for. */
  oauthReady: ProviderId[];
  /** How the last connection went, in words for the founder. */
  result: { tone: "success" | "error"; text: string } | null;
  provider: ProviderId | null;
  onProvider: (provider: ProviderId | null) => void;
  /** What the form sent last, after a failed save. */
  values?: Record<string, string>;
  /** What visitors see of the figures. */
  children: React.ReactNode;
}) {
  // What a disconnection found. The card that did it is replaced as soon as the page has the
  // change, so the result is kept here.
  const [outcome, setOutcome] = useState<ActionState>({});
  // A replacement that failed comes back with its provider chosen, so its fields stay open.
  const [replacing, setReplacing] = useState(() => !!connection && provider !== null);
  const current = connection && isProviderId(connection.provider) ? connection.provider : null;
  return (
    <Section
      id="revenue"
      title="Verified revenue"
      description="Connect your payment provider with a read-only key to verify MRR and subscribers. Verified MRR is ranked on the leaderboard, and the link to your website is followed by search engines. You can also do this later."
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
                value={provider}
                onChange={onProvider}
                onClear={() => {
                  onProvider(null);
                  setReplacing(false);
                }}
                clearLabel="Keep the current connection"
              />
              {provider && (
                <ProviderFields
                  provider={provider}
                  replace
                  oauthReady={oauthReady}
                  values={values}
                />
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setReplacing(true)}
              className="w-fit text-left text-sm text-muted-foreground hover:text-foreground"
            >
              {current && connectsWithOAuth(current)
                ? "Reconnect or change the provider"
                : "Replace the key or change the provider"}
            </button>
          )}
        </>
      ) : (
        <div className="grid gap-4">
          <Feedback state={outcome} />
          <ProviderChoice
            value={provider}
            onChange={onProvider}
            onClear={provider ? () => onProvider(null) : undefined}
            clearLabel="Connect later"
          />
          {provider && (
            <ProviderFields
              provider={provider}
              replace={false}
              oauthReady={oauthReady}
              values={values}
            />
          )}
        </div>
      )}
      {children}
    </Section>
  );
}
