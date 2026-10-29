"use client";

import { useEffect, useRef, useState } from "react";
import Link from "@/components/link";
import { Dialog } from "radix-ui";
import { MessageSquareHeart } from "lucide-react";
import { useTranslations } from "next-intl";
import { submitFeedbackAction } from "@/app/feedback-actions";
import {
  FEEDBACK_KINDS,
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  FEEDBACK_TRAP,
} from "@/lib/feedback";
import { Feedback, Field, Submit } from "./forms";
import { RouteDialog } from "./route-dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { useEditorAction } from "./use-editor-action";

/**
 * What the user or visitor wants to tell the admins. A visitor may leave an email address for a
 * reply. Once sent, it calls `onSent`, or without it gives way to a thank-you with a link back to
 * the page it came from.
 */
export function FeedbackForm({
  from,
  visitor,
  onSent,
}: {
  from: string | null;
  visitor: boolean;
  onSent?: () => void;
}) {
  const t = useTranslations("feedback");
  const [state, action] = useEditorAction(async (previous, form) => {
    const result = await submitFeedbackAction(from, previous, form);
    if (result.success) onSent?.();
    return result;
  });
  const sent = state.success === "sent";
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (sent) heading.current?.focus();
  }, [sent]);

  if (sent && !onSent)
    return (
      <section
        aria-labelledby="feedback-sent"
        className="grid gap-4 rounded-xl border bg-surface p-6 shadow-card"
      >
        <MessageSquareHeart aria-hidden="true" className="size-8 text-brand" />
        <h2
          id="feedback-sent"
          ref={heading}
          tabIndex={-1}
          className="text-xl font-semibold tracking-tight focus:outline-none"
        >
          {t("thanks.title")}
        </h2>
        <p className="leading-7 text-muted-foreground">{t("thanks.description")}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline" className="h-10">
            {/* A path without language prefix, which Link puts in the page's language. */}
            <Link href={from ?? "/"}>{from ? t("thanks.back") : t("thanks.start")}</Link>
          </Button>
        </div>
      </section>
    );

  return (
    <form action={action} className="grid gap-6">
      <fieldset className="grid gap-2.5">
        <legend className="mb-3 text-sm font-medium">{t("form.legend")}</legend>
        {FEEDBACK_KINDS.map((kind) => (
          <label
            key={kind}
            className="flex cursor-pointer items-start gap-3 rounded-lg border bg-surface px-4 py-3 shadow-control transition-colors hover:border-border-strong has-checked:border-brand"
          >
            <input
              type="radio"
              name="kind"
              value={kind}
              required
              defaultChecked={state.values?.kind === kind}
              className="mt-1 size-4 shrink-0 accent-brand"
            />
            <span>
              <span className="block text-sm font-medium">{t(`kinds.${kind}.label`)}</span>
              <span className="block text-[13px] text-muted-foreground">
                {t(`kinds.${kind}.hint`)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <Field name="message" label={t("form.message")} hint={t("form.messageHint")} required>
        <Textarea
          id="message"
          name="message"
          rows={5}
          required
          minLength={FEEDBACK_MIN_LENGTH}
          maxLength={FEEDBACK_MAX_LENGTH}
          defaultValue={state.values?.message}
        />
      </Field>
      {visitor && (
        <Field name="feedback_email" label={t("form.email")} hint={t("form.emailHint")}>
          <Input
            id="feedback_email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            defaultValue={state.values?.email}
          />
        </Field>
      )}
      {/* Out of sight and out of the tab order; only bots fill it in. Off the start side, so it
          never widens the page in either direction. */}
      <div aria-hidden="true" className="absolute -start-[9999px] size-px overflow-hidden">
        <label>
          {t("form.trap")}
          <input type="text" name={FEEDBACK_TRAP} tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <Feedback state={state} />
      <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted-foreground">
          {visitor ? t("form.privacyVisitor") : t("form.privacyUser")}
        </p>
        <Submit pendingLabel={t("form.sending")} className="shrink-0">
          {t("form.submit")}
        </Submit>
      </div>
    </form>
  );
}

/**
 * The form in a dialog over the page it was opened from (`src/app/@modal/(.)feedback`). Once sent,
 * the dialog thanks the user, and closing it returns to that page.
 */
export function FeedbackDialog({ from, visitor }: { from: string | null; visitor: boolean }) {
  const t = useTranslations("feedback");
  const [sent, setSent] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (sent) title.current?.focus();
  }, [sent]);
  return (
    <RouteDialog
      title={sent ? t("thanks.title") : t("heading.title")}
      description={sent ? t("thanks.description") : t("heading.description")}
      icon={sent ? <MessageSquareHeart aria-hidden="true" className="size-8 text-brand" /> : null}
      width="medium"
      titleRef={title}
    >
      {sent ? (
        <div className="flex justify-end">
          <Dialog.Close asChild>
            <Button variant="outline" className="h-10">
              {t("thanks.done")}
            </Button>
          </Dialog.Close>
        </div>
      ) : (
        <FeedbackForm from={from} visitor={visitor} onSent={() => setSent(true)} />
      )}
    </RouteDialog>
  );
}
