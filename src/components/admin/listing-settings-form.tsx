"use client";

import { startTransition, useActionState, useState } from "react";
import { saveListingSettingsAction } from "@/app/admin-actions";
import { Feedback, Submit } from "../forms";

export function ListingSettingsForm({ allowOtherProvider }: { allowOtherProvider: boolean }) {
  const [state, action, pending] = useActionState(saveListingSettingsAction, {});
  const [hideOther, setHideOther] = useState(!allowOtherProvider);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
      className="grid gap-5"
    >
      <div>
        <label className="flex items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            name="hide_other_provider"
            checked={hideOther}
            onChange={(event) => setHideOther(event.target.checked)}
            disabled={pending}
            className="size-4 accent-brand"
            aria-describedby="provider-requirement"
          />
          Hide Other and require a provider connection
        </label>
        <p id="provider-requirement" className="mt-2 text-sm text-muted-foreground">
          Removes Other from the product form. New products stay private until a supported payment
          provider connects successfully. Products already listed stay public.
        </p>
      </div>
      <Feedback state={state} />
      <div>
        <Submit pending={pending} pendingLabel="Saving...">
          Save settings
        </Submit>
      </div>
    </form>
  );
}
