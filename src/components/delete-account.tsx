"use client";

import Link from "next/link";
import { deleteAccountAction } from "@/app/actions";
import { Feedback, Field, Section, Submit } from "./forms";
import { Input } from "./ui/input";
import { useEditorAction } from "./use-editor-action";

export function DeleteAccount() {
  const [state, action] = useEditorAction(deleteAccountAction);
  return (
    <div id="delete-account" className="mt-10 scroll-mt-24 border-t pt-8">
      <Section
        title="Delete account"
        description="Permanently deletes your account and everything in it. This cannot be undone."
      >
        <form action={action} className="grid gap-5">
          <div className="grid gap-2 text-sm text-muted-foreground">
            <p>
              Your maker profile, your products and their logos, your Stripe connections with the
              stored keys, and all verification history are deleted. Your products leave the
              leaderboard at once.
            </p>
            <p>
              Restricted keys you created stay in your Stripe account until you delete them there,
              under <span className="whitespace-nowrap">Developers → API keys</span>. See the{" "}
              <Link href="/privacy" className="font-medium text-foreground underline">
                privacy policy
              </Link>{" "}
              for what we store.
            </p>
          </div>
          <Field name="delete_password" label="Confirm with your password">
            <Input
              id="delete_password"
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={128}
              required
            />
          </Field>
          <Feedback state={state} />
          <div>
            <Submit variant="destructive" pendingLabel="Deleting...">
              Delete account
            </Submit>
          </div>
        </form>
      </Section>
    </div>
  );
}
