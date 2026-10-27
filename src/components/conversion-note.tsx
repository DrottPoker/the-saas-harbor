import { getTranslations } from "next-intl/server";
import { getMoney } from "@/lib/display-currency";
import { isConverted } from "@/lib/display-money";
import { cn } from "@/lib/utils";

/**
 * Says that the amounts nearby are converted from US dollars, and at which day's rate; nothing
 * when they are in US dollars. With `ranked`, also that the ranking uses US dollars.
 */
export async function ConversionNote({
  ranked = false,
  className,
}: {
  ranked?: boolean;
  className?: string;
}) {
  const money = await getMoney();
  if (!isConverted(money) || !money.date) return null;
  const t = await getTranslations("money");
  const name = new Intl.DisplayNames([money.locale], { type: "currency" }).of(money.currency);
  const date = new Intl.DateTimeFormat(money.locale, { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${money.date}T00:00:00Z`),
  );
  const currency = name && name !== money.currency ? `${name} (${money.currency})` : money.currency;
  return (
    <p className={cn("text-[13px] text-faint-foreground", className)}>
      {t("converted", { currency, date })}
      {ranked && ` ${t("rankedInUsd")}`}
    </p>
  );
}
