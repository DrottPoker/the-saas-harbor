"use client";

import { useActionState } from "react";
import { setBlockedAction } from "@/app/message-actions";
import { Submit } from "../forms";
import { Notice } from "../shell";

export function BlockControl({
  makerId,
  name,
  blocked,
}: {
  makerId: string;
  name: string;
  blocked: boolean;
}) {
  const [state, action] = useActionState(setBlockedAction.bind(null, makerId, !blocked), {});
  return (
    <form action={action} className="grid justify-items-end gap-2">
      <Submit variant="outline" size="sm" pendingLabel={blocked ? "Unblocking..." : "Blocking..."}>
        {blocked ? "Unblock" : "Block"}
        <span className="sr-only"> {name}</span>
      </Submit>
      {state.error && <Notice tone="error">{state.error}</Notice>}
    </form>
  );
}
