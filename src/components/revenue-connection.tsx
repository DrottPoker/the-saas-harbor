"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { CircleAlert, CircleCheck, ExternalLink } from "lucide-react";
import {
  connectProviderAction,
  disconnectProviderAction,
  refreshRevenueAction,
} from "@/app/revenue-actions";
import { formatDate, formatUsd, type ActionState } from "@/lib/domain";
import type { RevenueConnection, RevenueSnapshot } from "@/lib/data";
import {
  isProviderId,
  PROVIDER_IDS,
  PROVIDERS,
  providerAccount,
  type ProviderId,
} from "@/lib/revenue/catalog";
import { STRIPE_KEY_PERMISSIONS, stripeKeyCreationUrl } from "@/lib/revenue/stripe/key";
import { SITE_NAME } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { Actions, Feedback, Field, Section, Submit } from "./forms";
import { Notice } from "./shell";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useEditorAction } from "./use-editor-action";

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
    reads: "subscriptions and paid invoices",
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
    reads: "subscriptions and paid transactions",
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
    reads: "your organization, subscriptions and paid orders",
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
    reads: "products, subscriptions and paid transactions",
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
    reads: "subscriptions and paid invoices",
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
    reads: "memberships, plans, promo codes and paid payments",
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
    reads: "your project's MRR and active subscriptions charts",
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
};

// Outside the key form, so the reset after each submission leaves the choice as it was.
function ProviderChoice({
  name,
  value,
  onChange,
}: {
  name: string;
  value: ProviderId;
  onChange: (provider: ProviderId) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">Payment provider</legend>
      <div className="flex flex-wrap gap-2">
        {PROVIDER_IDS.map((id) => (
          <label
            key={id}
            className={cn(
              "relative cursor-pointer rounded-full border bg-surface px-3 py-1 text-[13px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground",
              "has-[:checked]:border-foreground has-[:checked]:bg-foreground has-[:checked]:text-background",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand has-[:focus-visible]:ring-offset-2",
            )}
          >
            <input
              type="radio"
              name={name}
              value={id}
              checked={value === id}
              onChange={() => onChange(id)}
              // Covers the whole chip, so a click anywhere on it reaches the radio button itself.
              className="absolute inset-0 cursor-pointer appearance-none rounded-full opacity-0"
            />
            {PROVIDERS[id].name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ConnectForm({
  saasId,
  replace,
  initial = "stripe",
}: {
  saasId: string;
  replace: boolean;
  initial?: ProviderId;
}) {
  const [provider, setProvider] = useState<ProviderId>(initial);
  const [state, action] = useEditorAction(connectProviderAction.bind(null, saasId, provider));
  const group = useId();
  const { name, keyLabel, newKeyLabel, placeholder } = PROVIDERS[provider];
  const account = providerAccount(provider);
  const guide = guides[provider];
  return (
    <div className="grid gap-4">
      <ProviderChoice name={group} value={provider} onChange={setProvider} />
      <form action={action} className="grid gap-4">
        <KeyGuide guide={guide} />
        {/* Names the provider in the submitted values, so a typed site or project returns only
            to the provider it was typed for. */}
        <input type="hidden" name="provider" value={provider} />
        {account && (
          <Field name="provider_account" label={account.label}>
            <Input
              key={provider}
              id="provider_account"
              name="provider_account"
              autoComplete="off"
              spellCheck={false}
              placeholder={account.placeholder}
              defaultValue={
                state.values?.provider === provider ? state.values.provider_account : undefined
              }
              required
            />
          </Field>
        )}
        <Field name="provider_key" label={replace ? newKeyLabel : keyLabel}>
          <Input
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
          The key is encrypted and only used to read {guide.reads}. You can revoke it in {name} at
          any time.{" "}
          <Link href="/privacy#revenue" className="font-medium text-foreground underline">
            How we handle payment provider data
          </Link>
        </p>
        <Feedback state={state} />
        <Actions>
          <Submit>{replace ? "Replace and verify" : "Connect and verify"}</Submit>
        </Actions>
      </form>
    </div>
  );
}

function Connected({
  saasId,
  connection,
  snapshot,
}: {
  saasId: string;
  connection: RevenueConnection;
  snapshot: RevenueSnapshot | null;
}) {
  const [refreshState, refresh] = useActionState<ActionState>(
    refreshRevenueAction.bind(null, saasId),
    {},
  );
  const [disconnectState, disconnect] = useActionState<ActionState>(
    disconnectProviderAction.bind(null, saasId),
    {},
  );
  const [confirming, setConfirming] = useState(false);
  const ok = connection.status === "ok";
  const provider = isProviderId(connection.provider) ? connection.provider : "stripe";
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
              Key {connection.key_hint}
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
              <dt className="text-sm text-muted-foreground">Paying customers</dt>
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
        <div className="flex flex-wrap items-center justify-end gap-2 border-t p-4">
          <form action={refresh}>
            <Submit className="h-8 px-3 text-[13px]">Refresh now</Submit>
          </form>
          {confirming ? (
            <form action={disconnect} className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Keep connected
              </Button>
              <Button type="submit" variant="destructive" size="sm">
                Confirm disconnect
              </Button>
            </form>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
              Disconnect
            </Button>
          )}
        </div>
      </div>
      <Feedback state={refreshState} />
      <Feedback state={disconnectState} />
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Replace the key or change the provider
        </summary>
        <div className="pt-4">
          <ConnectForm saasId={saasId} replace initial={provider} />
        </div>
      </details>
    </div>
  );
}

export function RevenueConnectionSection({
  saasId,
  connection,
  snapshot,
  created,
}: {
  saasId: string;
  connection: RevenueConnection | null;
  snapshot: RevenueSnapshot | null;
  created: boolean;
}) {
  return (
    <div id="revenue" className="mt-2 scroll-mt-24 border-t pt-8">
      <Section
        title="Revenue verification"
        description="MRR and paying customers are read from your payment provider with a read-only key and refreshed every hour. They cannot be typed in."
      >
        {created && !connection && (
          <Notice tone="success">
            Product added. Connect your payment provider to verify its revenue.
          </Notice>
        )}
        {connection ? (
          <Connected saasId={saasId} connection={connection} snapshot={snapshot} />
        ) : (
          <ConnectForm saasId={saasId} replace={false} />
        )}
      </Section>
    </div>
  );
}
