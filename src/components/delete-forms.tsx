"use client";

import Link from "next/link";
import { deleteAccountAction, deleteSaasAction } from "@/app/actions";
import { Feedback, Field, Section, Submit } from "./forms";
import { PROVIDER_NAMES, type OAuthProvider } from "@/lib/auth";
import { ProviderButton } from "./provider-button";
import { Notice } from "./shell";
import { Input } from "./ui/input";
import { useEditorAction } from "./use-editor-action";

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
    <div id={id} className="mt-10 scroll-mt-6 border-t pt-8">
      <Section title={title} description={description}>
        {children}
      </Section>
    </div>
  );
}

export function DeleteAccount({
  method,
  confirmed = false,
  failed = false,
}: {
  /** Accounts without a password confirm by signing in with their provider again. */
  method: "password" | OAuthProvider;
  /** Whether this session signed in with Google or GitHub in the last five minutes. */
  confirmed?: boolean;
  /** Whether the last confirmation with the provider did not finish. */
  failed?: boolean;
}) {
  const [state, action] = useEditorAction(deleteAccountAction);
  const provider = method === "password" ? null : method;
  const name = provider && PROVIDER_NAMES[provider];
  return (
    <DeleteSection
      id="delete-account"
      title="Delete account"
      description="Permanently deletes your account and everything in it. This cannot be undone."
    >
      <form action={action} className="grid gap-5">
        <div className="grid gap-2 text-sm text-muted-foreground">
          <p>
            Your profile, your products and their logos, your payment provider connections with the
            stored keys, all verification history, the reports you sent and your conversations are
            deleted, also for the users you wrote with. Your products leave the leaderboard at once.
          </p>
          <p>
            Keys you created stay with your payment provider until you delete them there. See the{" "}
            <Link href="/privacy" className="font-medium text-foreground underline">
              privacy policy
            </Link>{" "}
            for what we store.
          </p>
        </div>
        {!provider ? (
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
        ) : confirmed ? (
          <Notice>You confirmed with {name}. Delete your account within five minutes.</Notice>
        ) : (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              Your account signs in with {name}. Confirm it is you with {name} first.
            </p>
            {failed && (
              <Notice tone="error">{name} did not confirm it is you. Please try again.</Notice>
            )}
            <div>
              <ProviderButton
                provider={provider}
                href={`/auth/oauth/${provider}?confirm=delete`}
                className="h-9"
              >
                Confirm with {name}
              </ProviderButton>
            </div>
          </div>
        )}
        <Feedback state={state} />
        {(!provider || confirmed) && (
          <div>
            <Submit variant="destructive" pendingLabel="Deleting...">
              Delete account
            </Submit>
          </div>
        )}
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
            The product page, its logo, its payment provider connection with the stored key, and all
            verification history are deleted, and the product leaves the leaderboard at once. Your
            profile and other products are not affected.
          </p>
          {connected && (
            <p>
              The payment provider account can then verify another product. The key stays with your
              provider until you delete it there.
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
