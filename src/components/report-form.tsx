"use client";

import Link from "next/link";
import { submitReportAction } from "@/app/report-actions";
import {
  DETAILS_MAX_LENGTH,
  REASONS,
  reasonHints,
  reasonLabels,
  type ReportTarget,
} from "@/lib/moderation";
import { Feedback, Field, Submit } from "./forms";
import { Textarea } from "./ui/textarea";
import { useEditorAction } from "./use-editor-action";

export function ReportForm({ target, id }: { target: ReportTarget; id: string }) {
  const [state, action] = useEditorAction(submitReportAction.bind(null, target, id));
  return (
    <form action={action} className="grid gap-6">
      <fieldset className="grid gap-2.5">
        <legend className="mb-3 text-sm font-medium">What is the problem?</legend>
        {REASONS.map((reason) => (
          <label
            key={reason}
            className="flex cursor-pointer items-start gap-3 rounded-lg border bg-surface px-4 py-3 transition-colors hover:border-border-strong has-checked:border-brand"
          >
            <input
              type="radio"
              name="reason"
              value={reason}
              required
              defaultChecked={state.values?.reason === reason}
              className="mt-1 size-4 shrink-0 accent-brand"
            />
            <span>
              <span className="block text-sm font-medium">{reasonLabels[reason]}</span>
              <span className="block text-[13px] text-muted-foreground">{reasonHints[reason]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Field
        name="details"
        label="Details"
        hint="What is wrong, and where? Required for illegal content and for something else."
      >
        <Textarea
          id="details"
          name="details"
          rows={4}
          maxLength={DETAILS_MAX_LENGTH}
          defaultValue={state.values?.details}
        />
      </Field>
      <Feedback state={state} />
      <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted-foreground">
          The maker is not told who reported. The{" "}
          <Link href="/terms#rules" className="font-medium text-foreground underline">
            terms
          </Link>{" "}
          list what is not allowed.
        </p>
        <Submit pendingLabel="Sending...">Send report</Submit>
      </div>
    </form>
  );
}
