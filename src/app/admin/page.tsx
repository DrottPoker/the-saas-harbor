import Link from "next/link";
import { FeedbackList } from "@/components/admin/feedback-list";
import { LogList, ReportList } from "@/components/admin/rows";
import { Metric } from "@/components/metric";
import { EmptyState, PageHeader } from "@/components/shell";
import { adminPaymentProviders, profileNames, requireAdmin, type ProviderCount } from "@/lib/admin";
import { providerName } from "@/lib/revenue/catalog";

// Labels may wrap on phones, so the figures keep to the bottom and line up.
const card = "flex flex-col justify-between rounded-xl border bg-surface shadow-card";

// Products by payment provider, most first.
function ProviderCounts({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: ProviderCount[];
  empty: string;
}) {
  return (
    <div className="rounded-xl border bg-surface p-5 shadow-card">
      <h3 className="text-sm font-medium">{title}</h3>
      {rows.length ? (
        <dl className="mt-3 grid gap-2 text-sm">
          {rows.map((row) => (
            <div key={row.name} className="flex items-baseline justify-between gap-4">
              <dt className="min-w-0 [overflow-wrap:anywhere]">{row.name}</dt>
              <dd className="shrink-0 text-muted-foreground tabular-nums">
                {row.products} {row.products === 1 ? "product" : "products"}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function SectionHeading({ id, title, href }: { id: string; title: string; href: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      <Link href={href} className="text-sm text-muted-foreground hover:text-foreground">
        View all
      </Link>
    </div>
  );
}

export default async function AdminOverview() {
  const { client } = await requireAdmin();
  const count = { count: "exact", head: true } as const;
  const [open, hidden, suspended, accounts, queue, log, feedback] = await Promise.all([
    client.from("reports").select("id", count).eq("status", "open"),
    client.from("saas").select("id", count).not("hidden_at", "is", null),
    client.from("profiles").select("id", count).not("suspended_at", "is", null),
    client.rpc("admin_accounts", { p_search: "", p_filter: "all" }, count),
    client
      .from("reports")
      .select("id, target, content, reason, status, created_at, subject_id")
      .eq("status", "open")
      .order("created_at")
      .limit(5),
    client.from("moderation_log").select("*").order("created_at", { ascending: false }).limit(5),
    client
      .from("feedback")
      .select("id, kind, message, page, created_at, handled_at, user_id, reply_email", {
        count: "exact",
      })
      .is("handled_at", null)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);
  for (const result of [open, hidden, suspended, accounts, queue, log, feedback])
    if (result.error) throw new Error("The admin overview could not be loaded.");
  const [makers, admins, senders, providers] = await Promise.all([
    profileNames(client, queue.data?.map((report) => report.subject_id) ?? []),
    profileNames(client, log.data?.map((entry) => entry.admin_id) ?? []),
    profileNames(client, feedback.data?.map((item) => item.user_id) ?? []),
    adminPaymentProviders(client),
  ]);

  return (
    <>
      <PageHeader
        title="Admin"
        description="Review reports from users, hide products and suspend accounts. Every decision is logged."
      />
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric className={card} label="Open reports" value={String(open.count ?? 0)} />
        <Metric className={card} label="Hidden products" value={String(hidden.count ?? 0)} />
        <Metric className={card} label="Suspended accounts" value={String(suspended.count ?? 0)} />
        <Metric className={card} label="Accounts" value={String(accounts.count ?? 0)} />
      </dl>

      <section aria-labelledby="queue" className="mt-12">
        <SectionHeading id="queue" title="Oldest open reports" href="/admin/reports" />
        {queue.data?.length ? (
          <ReportList reports={queue.data} names={makers} label="Oldest open reports" />
        ) : (
          <EmptyState title="No open reports">New reports from users appear here.</EmptyState>
        )}
      </section>

      <section aria-labelledby="feedback" className="mt-12">
        <SectionHeading
          id="feedback"
          title={`New feedback${feedback.count ? ` (${feedback.count})` : ""}`}
          href="/admin/feedback"
        />
        {feedback.data?.length ? (
          <FeedbackList items={feedback.data} names={senders} label="New feedback" />
        ) : (
          <EmptyState title="No new feedback">
            Bugs and suggestions from users appear here.
          </EmptyState>
        )}
      </section>

      <section aria-labelledby="decisions" className="mt-12">
        <SectionHeading id="decisions" title="Latest decisions" href="/admin/log" />
        {log.data?.length ? (
          <LogList entries={log.data} admins={admins} label="Latest decisions" />
        ) : (
          <EmptyState title="No decisions yet">
            Hidden products, suspensions and dismissed reports are listed here.
          </EmptyState>
        )}
      </section>

      <section aria-labelledby="providers" className="mt-12">
        <h2 id="providers" className="text-lg font-semibold">
          Payment providers
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          The providers products are connected to, and the ones founders write under Other when
          theirs is not supported.{" "}
          {providers.none === 1
            ? "1 product has neither."
            : `${providers.none} products have neither.`}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <ProviderCounts
            title="Connected"
            rows={providers.connected.map((row) => ({ ...row, name: providerName(row.name) }))}
            empty="No product is connected yet."
          />
          <ProviderCounts
            title="Written under Other"
            rows={providers.other}
            empty="No founder has written a provider yet."
          />
        </div>
      </section>
    </>
  );
}
