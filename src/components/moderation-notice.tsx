import Link from "@/components/link";
import { useTranslations } from "next-intl";
import { operator } from "@/lib/legal";
import { isReason } from "@/lib/moderation";
import { cn } from "@/lib/utils";
import { Contact } from "./legal";
import { LocalTime } from "./local-time";

/** Tells a maker that an admin hid their product or suspended their account, and why. */
export function ModerationNotice({
  kind,
  at,
  reason,
  note,
  className,
}: {
  kind: "product" | "account";
  at: string;
  reason: string | null;
  note: string;
  className?: string;
}) {
  const t = useTranslations("moderation");
  const id = `moderation-${kind}`;
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "rounded-lg border border-error-border bg-error-bg px-4 py-3 text-sm text-error",
        className,
      )}
    >
      <h2 id={id} className="font-semibold">
        {t.rich(`${kind}.heading`, {
          hidden: (chunks) => <span className="sr-only">{chunks}</span>,
          date: () => <LocalTime format="date" value={at} />,
        })}
      </h2>
      <p className="mt-1">{t(`${kind}.effect`)}</p>
      <dl className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-[7rem_minmax(0,1fr)]">
        <dt className="font-medium">{t("reason")}</dt>
        <dd>{isReason(reason) ? t(`decisions.${reason}`) : t("notGiven")}</dd>
        {note && (
          <>
            <dt className="font-medium">{t("explanation")}</dt>
            <dd dir="auto" className="whitespace-pre-wrap [overflow-wrap:anywhere]">
              {note}
            </dd>
          </>
        )}
      </dl>
      <p className="mt-3">
        {t("byPerson")}{" "}
        {operator.email && (
          <>{t.rich("appeal", { contact: () => <Contact className="font-medium underline" /> })} </>
        )}
        {t.rich("terms", {
          link: (chunks) => (
            <Link href="/terms#moderation" className="font-medium underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </section>
  );
}
