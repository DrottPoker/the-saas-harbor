import Link from "next/link";
import type { LogEntry, Report } from "@/lib/admin";
import { formatDate } from "@/lib/domain";
import {
  actionLabels,
  adminStatusLabels,
  decisionLabels,
  excerpt,
  isReason,
  isReportStatus,
  reasonLabels,
  reportTitle,
  statusTones,
  targetLabels,
  type ModerationAction,
  type ReportTarget,
} from "@/lib/moderation";
import { PersonAvatar, ProductLogo } from "../avatars";
import { Badge } from "../badge";

const row =
  "flex flex-col gap-2 p-4 transition-colors hover:bg-subtle sm:flex-row sm:items-center sm:gap-4";

export function ReportList({
  reports,
  names,
  label = "Reports",
  showMaker = true,
}: {
  reports: Pick<
    Report,
    "id" | "target" | "content" | "reason" | "status" | "created_at" | "subject_id"
  >[];
  /** Maker names by id, for the maker each report is about. */
  names: Map<string, string>;
  label?: string;
  /** Off on pages about one maker, where the name would repeat on every row. */
  showMaker?: boolean;
}) {
  return (
    <ul aria-label={label} className="divide-y rounded-xl border bg-surface">
      {reports.map((report) => {
        const status = isReportStatus(report.status) ? report.status : "open";
        // A profile report's title is already the maker's name.
        const maker = showMaker && report.target !== "profile";
        return (
          <li key={report.id}>
            <Link href={`/admin/reports/${report.id}`} className={row}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  <span className="text-muted-foreground">
                    {targetLabels[report.target as ReportTarget] ?? "Report"}:
                  </span>{" "}
                  {reportTitle(report)}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {isReason(report.reason) ? reasonLabels[report.reason] : report.reason} ·{" "}
                  {maker && `${names.get(report.subject_id) ?? "Unknown user"} · `}
                  {formatDate(report.created_at)}
                </p>
              </div>
              <Badge tone={statusTones[status]} className="self-start sm:self-auto">
                {adminStatusLabels[status]}
              </Badge>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export type AdminProduct = {
  id: string;
  name: string;
  tagline: string;
  logo_path: string | null;
  created_at: string;
  hidden_at: string | null;
  owner: { name: string; suspended_at: string | null } | null;
};

export function ProductList({
  products,
  openReports,
  showMaker = true,
}: {
  products: AdminProduct[];
  openReports: Map<string, number>;
  /** Off on a maker's own page. */
  showMaker?: boolean;
}) {
  return (
    <ul aria-label="Products" className="divide-y rounded-xl border bg-surface">
      {products.map((product) => {
        const reports = openReports.get(product.id) ?? 0;
        return (
          <li key={product.id}>
            <Link href={`/admin/products/${product.id}`} className={row}>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <ProductLogo path={product.logo_path} name={product.name} />
                <div className="min-w-0">
                  <p className="truncate font-medium">{product.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {showMaker && `${product.owner?.name ?? "Unknown founder"} · `}Listed{" "}
                    {formatDate(product.created_at)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 sm:justify-end">
                {reports > 0 && (
                  <Badge tone="accent">
                    {reports} open {reports === 1 ? "report" : "reports"}
                  </Badge>
                )}
                {product.hidden_at && <Badge tone="error">Hidden</Badge>}
                {product.owner?.suspended_at && <Badge tone="error">Founder suspended</Badge>}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export type AdminAccount = {
  id: string;
  email: string;
  name: string | null;
  avatar_path: string | null;
  created_at: string;
  suspended_at: string | null;
  is_admin: boolean;
  products: number;
  open_reports: number;
};

export function AccountList({ accounts }: { accounts: AdminAccount[] }) {
  return (
    <ul aria-label="Accounts" className="divide-y rounded-xl border bg-surface">
      {accounts.map((account) => (
        <li key={account.id}>
          <Link href={`/admin/accounts/${account.id}`} className={row}>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <PersonAvatar path={account.avatar_path} name={account.name ?? account.email} />
              <div className="min-w-0">
                <p className="truncate font-medium">{account.name ?? "No profile"}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {account.email} · Joined {formatDate(account.created_at)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:justify-end">
              <Badge>
                {account.products} {account.products === 1 ? "product" : "products"}
              </Badge>
              {account.open_reports > 0 && (
                <Badge tone="accent">
                  {account.open_reports} open {account.open_reports === 1 ? "report" : "reports"}
                </Badge>
              )}
              {account.suspended_at && <Badge tone="error">Suspended</Badge>}
              {account.is_admin && <Badge>Admin</Badge>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Where a log entry points: the product while it exists, otherwise the maker's account.
function entryHref(entry: LogEntry) {
  if (entry.report_id) return `/admin/reports/${entry.report_id}`;
  if (entry.saas_id) return `/admin/products/${entry.saas_id}`;
  return `/admin/accounts/${entry.subject_id}`;
}

export function LogList({
  entries,
  admins,
  label = "Decisions",
}: {
  entries: LogEntry[];
  /** Admin names by id. */
  admins: Map<string, string>;
  label?: string;
}) {
  return (
    <ol aria-label={label} className="divide-y rounded-xl border bg-surface">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Link href={entryHref(entry)} className={row}>
            <div className="min-w-0 flex-1">
              <p className="font-medium [overflow-wrap:anywhere]">
                {actionLabels[entry.action as ModerationAction] ?? entry.action}:{" "}
                <span className="font-normal">{entry.target_label}</span>
              </p>
              {entry.note && (
                <p className="text-sm text-foreground/85 [overflow-wrap:anywhere]">
                  {excerpt(entry.note, 140)}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {isReason(entry.reason) && `${decisionLabels[entry.reason]} · `}
                {entry.admin_id
                  ? (admins.get(entry.admin_id) ?? "An admin")
                  : "A former admin"} · {formatDate(entry.created_at)}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}
