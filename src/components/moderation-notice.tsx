import Link from "next/link";
import { formatDate } from "@/lib/domain";
import { decisionLabels, isReason } from "@/lib/moderation";
import { cn } from "@/lib/utils";
import { Contact } from "./legal";

const copy = {
  product: {
    title: "Product hidden",
    heading: (date: string) => `An admin hid this product on ${date}.`,
    effect: "It is not shown anywhere on The SaaS Harbor. You can still edit or delete it.",
  },
  account: {
    title: "Account suspended",
    heading: (date: string) => `An admin suspended your account on ${date}.`,
    effect:
      "Your profile and products are hidden, and you cannot send messages or reports. You can still sign in, edit your products and delete your account.",
  },
};

/** Tells a maker that an admin hid their product or suspended their account, and why. */
export function ModerationNotice({
  kind,
  at,
  reason,
  note,
  className,
}: {
  kind: keyof typeof copy;
  at: string;
  reason: string | null;
  note: string;
  className?: string;
}) {
  const text = copy[kind];
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
        <span className="sr-only">{text.title}: </span>
        {text.heading(formatDate(at))}
      </h2>
      <p className="mt-1">{text.effect}</p>
      <dl className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-[7rem_minmax(0,1fr)]">
        <dt className="font-medium">Reason</dt>
        <dd>{isReason(reason) ? decisionLabels[reason] : "Not given"}</dd>
        {note && (
          <>
            <dt className="font-medium">Explanation</dt>
            <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{note}</dd>
          </>
        )}
      </dl>
      <p className="mt-3">
        A person made this decision, not an automated system. If you think it is wrong, write to{" "}
        <Contact className="font-medium underline" />. The{" "}
        <Link href="/terms#moderation" className="font-medium underline">
          terms
        </Link>{" "}
        explain what is not allowed.
      </p>
    </section>
  );
}
