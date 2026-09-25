import Link from "next/link";
import { LogList, ReportList } from "@/components/admin/rows";
import { Metric } from "@/components/metric";
import { EmptyState, PageHeader } from "@/components/shell";
import { profileNames, requireAdmin } from "@/lib/admin";

// Labels may wrap on phones, so the figures keep to the bottom and line up.
const card = "flex flex-col justify-between rounded-xl border bg-surface";

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
  const [open, hidden, suspended, accounts, queue, log] = await Promise.all([
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
  ]);
  for (const result of [open, hidden, suspended, accounts, queue, log])
    if (result.error) throw new Error("The admin overview could not be loaded.");
  const [makers, admins] = await Promise.all([
    profileNames(client, queue.data?.map((report) => report.subject_id) ?? []),
    profileNames(client, log.data?.map((entry) => entry.admin_id) ?? []),
  ]);

  return (
    <>
      <PageHeader
        title="Admin"
        description="Review reports from makers, hide products and suspend accounts. Every decision is logged."
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
          <EmptyState title="No open reports">New reports from makers appear here.</EmptyState>
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
    </>
  );
}
