"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { MessageSquareHeart } from "lucide-react";
import { submitFeedbackAction } from "@/app/feedback-actions";
import {
  FEEDBACK_KINDS,
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  feedbackHints,
  feedbackLabels,
} from "@/lib/feedback";
import { Feedback, Field, Submit } from "./forms";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { useEditorAction } from "./use-editor-action";

/** What the user wants to tell the admins. Once sent, the form gives way to a thank-you. */
export function FeedbackForm({ from }: { from: string | null }) {
  const [state, action] = useEditorAction(submitFeedbackAction.bind(null, from));
  const sent = state.success === "sent";
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (sent) heading.current?.focus();
  }, [sent]);

  if (sent)
    return (
      <section
        aria-labelledby="feedback-sent"
        className="grid gap-4 rounded-xl border bg-surface p-6"
      >
        <MessageSquareHeart aria-hidden="true" className="size-8 text-brand" />
        <h2
          id="feedback-sent"
          ref={heading}
          tabIndex={-1}
          className="text-xl font-semibold tracking-tight focus:outline-none"
        >
          Thank you for your feedback
        </h2>
        <p className="leading-7 text-muted-foreground">
          It went straight to the team behind The SaaS Harbor, who read everything that comes in.
        </p>
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
            className="flex cursor-pointer items-start gap-3 rounded-lg border bg-surface px-4 py-3 transition-colors hover:border-border-strong has-checked:border-brand"
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
          rows={6}
          required
          minLength={FEEDBACK_MIN_LENGTH}
          maxLength={FEEDBACK_MAX_LENGTH}
          defaultValue={state.values?.message}
        />
      </Field>
      <Feedback state={state} />
      <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted-foreground">
          Only admins read feedback, together with your name and the page you came from.
        </p>
        <Submit pendingLabel="Sending...">Send feedback</Submit>
      </div>
    </form>
  );
}
