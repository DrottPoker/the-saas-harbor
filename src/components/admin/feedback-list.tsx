import Link from "next/link";
import { setFeedbackHandledAction } from "@/app/feedback-actions";
import { formatDate } from "@/lib/domain";
import { FEEDBACK_KINDS, feedbackLabels, type FeedbackKind } from "@/lib/feedback";
import type { Database } from "@/lib/supabase/database.types";
import { Badge } from "../badge";
import { Button } from "../ui/button";

export type FeedbackRow = Pick<
  Database["public"]["Tables"]["feedback"]["Row"],
  "id" | "kind" | "message" | "page" | "created_at" | "handled_at" | "user_id"
>;

const kindTones: Record<FeedbackKind, "error" | "accent" | "neutral"> = {
  bug: "error",
  suggestion: "accent",
  other: "neutral",
};
const isKind = (kind: string): kind is FeedbackKind =>
  (FEEDBACK_KINDS as readonly string[]).includes(kind);

/** Feedback in full, with who sent it, from where, and a button to mark it handled or new. */
export function FeedbackList({
  items,
  names,
  label = "Feedback",
}: {
  items: FeedbackRow[];
  /** Names by account id; accounts without a profile are missing. */
  names: Map<string, string>;
  label?: string;
}) {
  return (
    <ul aria-label={label} className="divide-y rounded-xl border bg-surface">
      {items.map((item) => {
        const kind = isKind(item.kind) ? item.kind : "other";
        return (
          <li key={item.id}>
            <article className="grid gap-3 p-4" aria-label={`${feedbackLabels[kind]} feedback`}>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge tone={kindTones[kind]}>{feedbackLabels[kind]}</Badge>
                {item.handled_at && <Badge tone="success">Handled</Badge>}
                <span>
                  From{" "}
                  <Link
                    href={`/admin/accounts/${item.user_id}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {names.get(item.user_id) ?? "an account without a profile"}
                  </Link>{" "}
                  · {formatDate(item.created_at)}
                </span>
              </div>
              <p className="leading-7 whitespace-pre-wrap [overflow-wrap:anywhere]">
                {item.message}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
                  {item.page ? (
                    <>
                      Sent from{" "}
                      <Link href={item.page} className="font-medium text-foreground underline">
                        {item.page}
                      </Link>
                    </>
                  ) : (
                    "Sent from the feedback page"
                  )}
                </p>
                <form action={setFeedbackHandledAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="handled" value={String(!item.handled_at)} />
                  <Button type="submit" size="sm" variant="outline">
                    {item.handled_at ? "Mark as new" : "Mark as handled"}
                  </Button>
                </form>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
