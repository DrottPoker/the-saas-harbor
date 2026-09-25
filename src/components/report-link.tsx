import Link from "next/link";
import { Flag } from "lucide-react";
import { reportPath, type ReportTarget } from "@/lib/moderation";
import { cn } from "@/lib/utils";

/** A quiet link to report a product or a profile. Visitors sign in first and continue there. */
export function ReportLink({
  target,
  id,
  className,
  children,
}: {
  target: ReportTarget;
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={reportPath(target, id)}
      rel="nofollow"
      className={cn(
        "inline-flex min-h-6 w-fit items-center gap-1.5 py-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground hover:underline",
        className,
      )}
    >
      <Flag aria-hidden="true" className="size-3.5" />
      {children}
    </Link>
  );
}
