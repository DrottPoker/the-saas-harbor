"use client";
import { useActionState } from "react";
import type { ActionState } from "@/lib/domain";

// Secrets are never kept in client state or written back into a field.
const SECRET_FIELDS = new Set(["password", "stripe_key"]);

type EditorState = ActionState & { values?: Record<string, string> };
export function useEditorAction(
  action: (state: ActionState, form: FormData) => Promise<ActionState>,
) {
  return useActionState<EditorState, FormData>(async (state, form) => {
    const result = await action(state, form);
    const values = Object.fromEntries(
      [...form.entries()].filter(
        ([key, value]) => typeof value === "string" && !SECRET_FIELDS.has(key),
      ),
    ) as Record<string, string>;
    return { ...result, values };
  }, {});
}
