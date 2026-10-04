"use client";
import { useActionState } from "react";
import type { ActionState } from "@/lib/domain";

// Secrets are never kept in client state or written back into a field.
const SECRET_FIELDS = new Set(["password", "current_password", "provider_key"]);

type EditorState<S> = S & { values?: Record<string, string> };
export function useEditorAction<S extends ActionState = ActionState>(
  action: (state: S, form: FormData) => Promise<S>,
) {
  return useActionState<EditorState<S>, FormData>(
    async (state, form) => {
      const result = await action(state, form);
      const values: Record<string, string> = {};
      for (const [key, value] of form.entries()) {
        if (typeof value !== "string" || SECRET_FIELDS.has(key)) continue;
        // A group of checkboxes sends one entry per ticked box; they are kept one per line.
        values[key] = key in values ? `${values[key]}\n${value}` : value;
      }
      return { ...result, values };
    },
    {} as Awaited<EditorState<S>>,
  );
}
