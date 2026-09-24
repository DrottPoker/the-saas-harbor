import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const styles = {
  up: { Icon: ArrowUpRight, color: "text-success", word: "Up" },
  down: { Icon: ArrowDownRight, color: "text-error", word: "Down" },
  flat: { Icon: ArrowRight, color: "text-muted-foreground", word: "Unchanged" },
};

/** 30-day MRR growth: direction is carried by the icon and sign as well as by color. */
export function Growth({ pct, className }: { pct: number; className?: string }) {
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
      <span aria-hidden="true" className="ml-0.5 text-muted-foreground">
        30d
      </span>
      <span className="sr-only">
        {direction === "flat" ? "Unchanged" : `${word} ${size}%`} over the last 30 days
      </span>
    </span>
  );
}
