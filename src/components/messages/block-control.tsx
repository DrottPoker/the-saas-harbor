"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("messages.block");
  const [state, action] = useActionState(setBlockedAction.bind(null, makerId, !blocked), {});
  return (
    <form action={action} className="grid justify-items-end gap-2">
      <Submit variant="outline" size="sm" pendingLabel={blocked ? t("unblocking") : t("blocking")}>
        {t.rich(blocked ? "unblock" : "block", {
          name,
          hidden: (chunks) => <span className="sr-only">{chunks}</span>,
        })}
      </Submit>
      {state.error && <Notice tone="error">{state.error}</Notice>}
    </form>
  );
}
