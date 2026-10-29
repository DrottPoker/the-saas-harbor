import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { LOCALE_INFO } from "@/i18n/config";
import { cn } from "@/lib/utils";

// Trends read along the time axis of the charts, which runs left to right in every language, so
// the arrows are not mirrored.
const styles = {
  up: { Icon: ArrowUpRight, color: "text-success" },
  down: { Icon: ArrowDownRight, color: "text-error" },
  flat: { Icon: ArrowRight, color: "text-muted-foreground" },
};

/**
 * A change in percent, by default 30-day MRR growth: direction is carried by the icon and sign as
 * well as by color. `period` is the visible suffix and the words for screen readers; the default
 * is in the page's language. With `lowerIsBetter`, such as for a bounce rate, a rise is shown in
 * the error color and a fall in the success color. With `points`, the change of a rate is in
 * percentage points: from 40% to 50% is +10 pts, not +25%. Client Components that render it need
 * the charts messages.
 */
export function Growth({
  pct,
  period,
  lowerIsBetter = false,
  points = false,
  className,
}: {
  pct: number;
  period?: { short: string | null; long: string };
  lowerIsBetter?: boolean;
  points?: boolean;
  className?: string;
}) {
  const t = useTranslations("charts.growth");
  const locale = LOCALE_INFO[useLocale()].intl;
  const { short, long } = period ?? { short: t("short"), long: t("long") };
  const direction = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  const { Icon } = styles[direction];
  const color =
    lowerIsBetter && direction !== "flat"
      ? styles[direction === "up" ? "down" : "up"].color
      : styles[direction].color;
  const digits = Math.abs(pct) >= 100 ? 0 : 1;
  const size = Math.abs(pct);
  const rounded = Number(size.toFixed(digits));
  const amount = points
    ? t("points", { count: rounded })
    : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: digits }).format(
        size / 100,
      );
  const sign = direction === "up" ? "+" : direction === "down" ? "−" : "";
  const spoken = points ? t("pointsSpoken", { count: rounded }) : amount;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs whitespace-nowrap", className)}>
      <span aria-hidden="true" className={cn("inline-flex items-center font-medium", color)}>
        <Icon className="size-3.5" />
        <span dir="ltr" className="tabular-nums">
          {sign}
          {amount}
        </span>
      </span>
      {short && (
        <span aria-hidden="true" className="ms-0.5 text-muted-foreground">
          {short}
        </span>
      )}
      <span className="sr-only">{t("spoken", { direction, amount: spoken, period: long })}</span>
    </span>
  );
}
