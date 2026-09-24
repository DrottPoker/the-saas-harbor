import { cn } from "@/lib/utils";

/** One figure in the bordered row of key figures on product and maker pages. */
export function Metric({
  label,
  value,
  empty = "Not shared",
  detail,
}: {
  label: string;
  value: string | null;
  empty?: string;
  detail?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 tabular-nums",
          value ? "text-2xl font-semibold tracking-tight" : "text-base text-faint-foreground",
        )}
      >
        {value ?? empty}
      </dd>
      {value && detail && <dd className="mt-1">{detail}</dd>}
    </div>
  );
}
