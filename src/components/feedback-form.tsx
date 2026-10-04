"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { MessageSquareHeart } from "lucide-react";
import { submitFeedbackAction } from "@/app/feedback-actions";
import {
  FEEDBACK_KINDS,
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  FEEDBACK_TRAP,
  feedbackHeading,
  feedbackHints,
  feedbackLabels,
} from "@/lib/feedback";
import { Feedback, Field, Submit } from "./forms";
import { RouteDialog } from "./route-dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { useEditorAction } from "./use-editor-action";

const thanks = {
  title: "Thank you for your feedback",
  description:
    "It went straight to the team behind The SaaS Harbor, who read everything that comes in.",
};

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
          {thanks.title}
        </h2>
        <p className="leading-7 text-muted-foreground">{thanks.description}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline" className="h-10">
            <Link href={from ?? "/"}>{from ? "Back to where you were" : "Back to the start"}</Link>
          </Button>
        </div>
      </section>
    );

  return (
    <form action={action} className="grid gap-6">
      <fieldset className="grid gap-2.5">
        <legend className="mb-3 text-sm font-medium">What is it about?</legend>
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
              <span className="block text-sm font-medium">{feedbackLabels[kind]}</span>
              <span className="block text-[13px] text-muted-foreground">{feedbackHints[kind]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Field
        name="message"
        label="Your feedback"
        hint="For a bug: what you did, what happened, and what you expected."
        required
      >
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
        <Field
          name="feedback_email"
          label="Email address (optional)"
          hint="Only if you want a reply. You do not need an account to send feedback."
        >
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
      {/* Out of sight and out of the tab order; only bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
        <label>
          Leave this empty
          <input type="text" name={FEEDBACK_TRAP} tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <Feedback state={state} />
      <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted-foreground">
          {visitor
            ? "Only admins read feedback, together with the page you came from and your email address, if you give one."
            : "Only admins read feedback, together with your name and the page you came from."}
        </p>
        <Submit pendingLabel="Sending..." className="shrink-0">
          Send feedback
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
  const [sent, setSent] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (sent) title.current?.focus();
  }, [sent]);
  return (
    <RouteDialog
      {...(sent ? thanks : feedbackHeading)}
      icon={sent ? <MessageSquareHeart aria-hidden="true" className="size-8 text-brand" /> : null}
      width="medium"
      titleRef={title}
    >
      {sent ? (
        <div className="flex justify-end">
          <Dialog.Close asChild>
            <Button variant="outline" className="h-10">
              Done
            </Button>
          </Dialog.Close>
        </div>
      ) : (
        <FeedbackForm from={from} visitor={visitor} onSent={() => setSent(true)} />
      )}
    </RouteDialog>
  );
}
