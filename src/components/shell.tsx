import { cn } from "@/lib/utils";

const widths = { wide: "max-w-6xl", medium: "max-w-5xl", narrow: "max-w-3xl" } as const;

export function Shell({
  size = "wide",
  className,
  children,
}: {
  size?: keyof typeof widths;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full px-4 pt-10 sm:px-6 sm:pt-14", widths[size], className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-5 pb-8 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {description && (
          <p className="mt-2.5 text-base text-muted-foreground sm:text-lg">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 gap-2 max-sm:w-full">{actions}</div>}
    </div>
  );
}

const tones = {
  info: "border-border bg-subtle text-foreground",
  success: "border-[#b7e3cf] bg-[#effaf4] text-[#0b6a3f]",
  error: "border-[#f5c2bd] bg-[#fef3f2] text-[#a3261b]",
} as const;

export function Notice({
  tone = "info",
  className,
  children,
}: {
  tone?: keyof typeof tones;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-lg border px-4 py-3 text-sm", tones[tone], className)}
    >
      {children}
    </p>
  );
}

export function EmptyState({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border-strong px-6 py-14 text-center">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{children}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
