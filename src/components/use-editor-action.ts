"use client";
import { useActionState } from "react";
import type { ActionState } from "@/lib/domain";

type EditorState = ActionState & { values?: Record<string, string> };
export function useEditorAction(
  action: (state: ActionState, form: FormData) => Promise<ActionState>,
) {
  return useActionState<EditorState, FormData>(async (state, form) => {
    const result = await action(state, form);
    const values = Object.fromEntries(
      [...form.entries()].filter(([key, value]) => typeof value === "string" && key !== "password"),
    ) as Record<string, string>;
    return { ...result, values };
  }, {});
}
