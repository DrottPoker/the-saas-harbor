"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import {
  connectStripeAction,
  disconnectStripeAction,
  refreshStripeAction,
} from "@/app/stripe-actions";
import { formatDate, formatUsd, type ActionState } from "@/lib/domain";
import type { RevenueSnapshot, StripeConnection } from "@/lib/data";
import { Actions, Feedback, Field, Section, Submit } from "./forms";
import { Notice } from "./shell";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useEditorAction } from "./use-editor-action";

function ConnectForm({ saasId, replace }: { saasId: string; replace: boolean }) {
  const [state, action] = useEditorAction(connectStripeAction.bind(null, saasId));
  return (
    <form action={action} className="grid gap-4">
      <ol className="grid list-decimal gap-1.5 pl-5 text-sm text-muted-foreground">
        <li>
          In Stripe, open{" "}
          <a
            href="https://dashboard.stripe.com/apikeys"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline underline-offset-2"
          >
            Developers → API keys
          </a>{" "}
          and choose <strong className="font-medium text-foreground">Create restricted key</strong>.
        </li>
        <li>
          Set <strong className="font-medium text-foreground">Read</strong> for Subscriptions,
          Invoices, Coupons and Prices. Leave every other permission at None.
        </li>
        <li>Copy the key, which starts with rk_live_, and paste it below.</li>
      </ol>
      <Field name="stripe_key" label={replace ? "New restricted key" : "Restricted key"}>
        <Input
          id="stripe_key"
          name="stripe_key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="rk_live_..."
          required
        />
      </Field>
      <p className="text-[13px] text-muted-foreground">
        The key is encrypted and only used to read subscriptions and paid invoices. You can revoke
        it in Stripe at any time.{" "}
        <Link href="/privacy#stripe" className="font-medium text-foreground underline">
          How we handle Stripe data
        </Link>
      </p>
      <Feedback state={state} />
      <Actions>
        <Submit>{replace ? "Replace and verify" : "Connect and verify"}</Submit>
      </Actions>
    </form>
  );
}

function Connected({
  saasId,
  connection,
  snapshot,
}: {
  saasId: string;
  connection: StripeConnection;
  snapshot: RevenueSnapshot | null;
}) {
  const [refreshState, refresh] = useActionState<ActionState>(
    refreshStripeAction.bind(null, saasId),
    {},
  );
  const [disconnectState, disconnect] = useActionState<ActionState>(
    disconnectStripeAction.bind(null, saasId),
    {},
  );
  const [confirming, setConfirming] = useState(false);
  const ok = connection.status === "ok";
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
              {ok ? "Connected to Stripe" : "The last verification failed"}
              {!connection.livemode && (
                <span className="ml-2 rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">
                  Test mode
                </span>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
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
            No revenue history yet. Replace the key with one that also has Invoices: Read to show
            the last 12 months as a chart.
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
          Replace the key
        </summary>
        <div className="pt-4">
          <ConnectForm saasId={saasId} replace />
        </div>
      </details>
    </div>
  );
}

export function StripeConnectionSection({
  saasId,
  connection,
  snapshot,
  created,
}: {
  saasId: string;
  connection: StripeConnection | null;
  snapshot: RevenueSnapshot | null;
  created: boolean;
}) {
  return (
    <div id="revenue" className="mt-2 scroll-mt-24 border-t pt-8">
      <Section
        title="Revenue verification"
        description="MRR and paying customers are read from Stripe with a read-only key and refreshed daily. They cannot be typed in."
      >
        {created && !connection && (
          <Notice tone="success">Product added. Connect Stripe to verify its revenue.</Notice>
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
