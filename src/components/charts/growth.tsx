import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const styles = {
  up: { Icon: ArrowUpRight, color: "text-success", word: "Up" },
  down: { Icon: ArrowDownRight, color: "text-error", word: "Down" },
  flat: { Icon: ArrowRight, color: "text-muted-foreground", word: "Unchanged" },
};

/**
 * A change in percent, by default 30-day MRR growth: direction is carried by the icon and sign as
 * well as by color. `period` is the visible suffix and the words for screen readers.
 */
export function Growth({
  pct,
  period = { short: "30d", long: "over the last 30 days" },
  className,
}: {
  pct: number;
  period?: { short: string | null; long: string };
  className?: string;
}) {
  const direction = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  const { Icon, color, word } = styles[direction];
  const size = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Math.abs(pct) >= 100 ? 0 : 1,
  }).format(Math.abs(pct));
  const sign = direction === "up" ? "+" : direction === "down" ? "−" : "";
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs whitespace-nowrap", className)}>
      <span aria-hidden="true" className={cn("inline-flex items-center font-medium", color)}>
        <Icon className="size-3.5" />
        <span className="tabular-nums">
          {sign}
          {size}%
        </span>
      </span>
      {period.short && (
        <span aria-hidden="true" className="ml-0.5 text-muted-foreground">
          {period.short}
        </span>
      )}
      <span className="sr-only">
        {direction === "flat" ? "Unchanged" : `${word} ${size}%`} {period.long}
      </span>
    </span>
  );
}
