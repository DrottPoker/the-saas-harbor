"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import {
  connectProviderAction,
  disconnectProviderAction,
  refreshRevenueAction,
} from "@/app/revenue-actions";
import { formatDate, formatUsd, type ActionState } from "@/lib/domain";
import type { RevenueConnection, RevenueSnapshot } from "@/lib/data";
import { isProviderId, PROVIDER_IDS, PROVIDERS, type ProviderId } from "@/lib/revenue/catalog";
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
const link = (href: string, text: string) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="font-medium text-foreground underline underline-offset-2"
  >
    {text}
  </a>
);

// How to create a read-only key with each provider, and what the key is used to read.
const guides: Record<ProviderId, { steps: React.ReactNode[]; reads: string }> = {
  stripe: {
    reads: "subscriptions and paid invoices",
    steps: [
      <>
        {link(stripeKeyCreationUrl(SITE_NAME), "Create a read-only key in Stripe")}. Stripe opens
        with the key&apos;s name and permissions filled in.
      </>,
      <>
        Check that {strong("Read")} is set for {permissionList} and None for everything else, then
        choose {strong("Create key")}.
      </>,
      "Copy the key, which starts with rk_live_, and paste it below.",
    ],
  },
  paddle: {
    reads: "subscriptions and paid transactions",
    steps: [
      <>
        In Paddle, open{" "}
        {link("https://vendors.paddle.com/authentication-v2", "Developer tools → Authentication")}{" "}
        and choose {strong("New API key")}.
      </>,
      <>
        Give it {strong("Read")} for Subscriptions and Transactions and no other permissions. Leave
        the expiry date empty, or the key stops working when it expires.
      </>,
      "Copy the key, which starts with pdl_live_apikey_, and paste it below.",
    ],
  },
  polar: {
    reads: "your organization, subscriptions and paid orders",
    steps: [
      <>
        In Polar, open your organization&apos;s{" "}
        {link("https://polar.sh/dashboard", "Settings → Developers")} and choose{" "}
        {strong("New Token")}.
      </>,
      <>
        Select the scopes organizations:read, subscriptions:read and orders:read and nothing else,
        and choose {strong("No expiration")}.
      </>,
      "Copy the token, which starts with polar_oat_, and paste it below.",
    ],
  },
  dodo: {
    reads: "subscriptions and payments",
    steps: [
      <>
        In Dodo Payments, open {link("https://app.dodopayments.com", "Developer → API Keys")} and
        choose {strong("Add API Key")}.
      </>,
      <>Turn off {strong("Enable write access")}, so the key can only read.</>,
      "Copy the key, which Dodo Payments shows only once, and paste it below.",
    ],
  },
};

// Why a connected product has no chart, in each provider's terms.
const noHistory: Record<ProviderId, string> = {
  stripe:
    "No revenue history yet. Replace the key with one that also has Invoices: Read to show the last 12 months as a chart.",
  paddle:
    "No revenue history: the Paddle account has more transactions than one verification reads.",
  polar: "No revenue history: the Polar account has more orders than one verification reads.",
  dodo: "No revenue history: Dodo Payments does not say which period a payment covers.",
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
  const guide = guides[provider];
  return (
    <div className="grid gap-4">
      <ProviderChoice name={group} value={provider} onChange={setProvider} />
      <form action={action} className="grid gap-4">
        <ol className="grid list-decimal gap-1.5 pl-5 text-sm text-muted-foreground">
          {guide.steps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
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
      <div className="rounded-xl border bg-surface">
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
