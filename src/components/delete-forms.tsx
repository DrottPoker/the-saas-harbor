"use client";

import Link from "next/link";
import { deleteAccountAction, deleteSaasAction } from "@/app/actions";
import { Feedback, Field, Section, Submit } from "./forms";
import { Input } from "./ui/input";
import { useEditorAction } from "./use-editor-action";

const stripeKeys = <span className="whitespace-nowrap">Developers → API keys</span>;

function DeleteSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="mt-10 scroll-mt-24 border-t pt-8">
      <Section title={title} description={description}>
        {children}
      </Section>
    </div>
  );
}

export function DeleteAccount() {
  const [state, action] = useEditorAction(deleteAccountAction);
  return (
    <DeleteSection
      id="delete-account"
      title="Delete account"
      description="Permanently deletes your account and everything in it. This cannot be undone."
    >
      <form action={action} className="grid gap-5">
        <div className="grid gap-2 text-sm text-muted-foreground">
          <p>
            Your maker profile, your products and their logos, your Stripe connections with the
            stored keys, all verification history, the reports you sent and your conversations are
            deleted, also for the makers you wrote with. Your products leave the leaderboard at
            once.
          </p>
          <p>
            Restricted keys you created stay in your Stripe account until you delete them there,
            under {stripeKeys}. See the{" "}
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
    </DeleteSection>
  );
}

export function DeleteProduct({
  saasId,
  name,
  connected,
}: {
  saasId: string;
  name: string;
  connected: boolean;
}) {
  const [state, action] = useEditorAction(deleteSaasAction.bind(null, saasId));
  return (
    <DeleteSection
      id="delete-product"
      title="Delete product"
      description="Permanently deletes this product. This cannot be undone."
    >
      <form action={action} className="grid gap-5">
        <div className="grid gap-2 text-sm text-muted-foreground">
          <p>
            The product page, its logo, its Stripe connection with the stored key, and all
            verification history are deleted, and the product leaves the leaderboard at once. Your
            maker profile and other products are not affected.
          </p>
          {connected && (
            <p>
              The Stripe account can then verify another product. The restricted key stays in your
              Stripe account until you delete it there, under {stripeKeys}.
            </p>
          )}
        </div>
        <Field name="confirm_name" label={`Type “${name}” to confirm`}>
          <Input
            id="confirm_name"
            name="confirm_name"
            autoComplete="off"
            spellCheck={false}
            maxLength={200}
            required
          />
        </Field>
        <Feedback state={state} />
        <div>
          <Submit variant="destructive" pendingLabel="Deleting...">
            Delete product
          </Submit>
        </div>
      </form>
    </DeleteSection>
  );
}
