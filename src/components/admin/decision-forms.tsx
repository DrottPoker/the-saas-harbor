"use client";

import {
  dismissReportAction,
  hideSaasAction,
  restoreAccountAction,
  restoreSaasAction,
  suspendAccountAction,
} from "@/app/admin-actions";
import { decisionLabels, NOTE_MAX_LENGTH, REASONS } from "@/lib/moderation";
import { cn } from "@/lib/utils";
import { Feedback, Field, Submit } from "../forms";
import { fieldClasses } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { useEditorAction } from "../use-editor-action";

const decisions = {
  hide: { action: hideSaasAction, submit: "Hide product", pending: "Hiding..." },
  suspend: { action: suspendAccountAction, submit: "Suspend account", pending: "Suspending..." },
};

/** Hides a product or suspends an account, with a reason and an explanation for the maker. */
export function DecisionForm({
  kind,
  targetId,
  reportId = null,
  returnTo,
  defaultReason,
}: {
  kind: keyof typeof decisions;
  targetId: string;
  reportId?: string | null;
  returnTo: string;
  defaultReason?: string;
}) {
  const decision = decisions[kind];
  const [state, action] = useEditorAction(decision.action.bind(null, targetId, reportId, returnTo));
  return (
    <form action={action} className="grid gap-4">
      <Field name={`${kind}-reason`} label="Reason">
        <select
          id={`${kind}-reason`}
          name="reason"
          required
          defaultValue={state.values?.reason ?? defaultReason ?? ""}
          className={cn(fieldClasses, "h-10")}
        >
          <option value="" disabled>
            Choose a reason
          </option>
          {REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {decisionLabels[reason]}
            </option>
          ))}
        </select>
      </Field>
      <Field
        name={`${kind}-note`}
        label="Explanation for the maker"
        hint="The maker sees this with the reason. Say what breaks the terms or the law."
      >
        <Textarea
          id={`${kind}-note`}
          name="note"
          required
          rows={3}
          maxLength={NOTE_MAX_LENGTH}
          defaultValue={state.values?.note}
        />
      </Field>
      <Feedback state={state} />
      <div>
        <Submit variant="destructive" pendingLabel={decision.pending}>
          {decision.submit}
        </Submit>
      </div>
    </form>
  );
}

const reversals = {
  saas: { action: restoreSaasAction, submit: "Show product again", pending: "Saving..." },
  account: { action: restoreAccountAction, submit: "Lift suspension", pending: "Saving..." },
  report: { action: dismissReportAction, submit: "Dismiss report", pending: "Dismissing..." },
};

/** Shows a product again, lifts a suspension or dismisses a report. The note is for admins. */
export function ReversalForm({
  kind,
  targetId,
  returnTo,
}: {
  kind: keyof typeof reversals;
  targetId: string;
  returnTo: string;
}) {
  const reversal = reversals[kind];
  const [state, action] = useEditorAction(reversal.action.bind(null, targetId, returnTo));
  return (
    <form action={action} className="grid gap-4">
      <Field
        name={`${kind}-log-note`}
        label="Note for the log"
        hint="Optional. Only admins see it."
      >
        <Textarea
          id={`${kind}-log-note`}
          name="note"
          rows={2}
          maxLength={NOTE_MAX_LENGTH}
          defaultValue={state.values?.note}
        />
      </Field>
      <Feedback state={state} />
      <div>
        <Submit variant="outline" pendingLabel={reversal.pending}>
          {reversal.submit}
        </Submit>
      </div>
    </form>
  );
}
