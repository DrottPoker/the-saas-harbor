"use client";

import { BadgeCheck } from "lucide-react";
import { checkDomainAction } from "@/app/domain-actions";
import { formatDate } from "@/lib/domain";
import { CopyField } from "./copy-field";
import { Feedback, Section, Submit } from "./forms";
import { Notice } from "./shell";
import { useEditorAction } from "./use-editor-action";

/**
 * The product editor's domain section: whether the domain is verified, the TXT record to add, and
 * a button that looks it up. `domain` is null when the website has no domain of its own.
 */
export function DomainVerification({
  saasId,
  domain,
  record,
  verifiedDomain,
  verifiedAt,
  missingSince,
}: {
  saasId: string;
  domain: string | null;
  /** The record's full name, the name without the domain, and its value. */
  record: { name: string; label: string; value: string } | null;
  verifiedDomain: string | null;
  verifiedAt: string | null;
  missingSince: string | null;
}) {
  const [state, action] = useEditorAction(checkDomainAction.bind(null, saasId));
  const verified = !!domain && verifiedDomain === domain;
  return (
    <div id="domain" className="mt-2 border-t pt-8">
      <Section
        title="Domain"
        description="Show that the website is yours: add a DNS record to its domain, and the product page says the domain is verified."
      >
        {!domain || !record ? (
          <Notice>
            Your website&apos;s address is not on a domain of its own, such as an IP address, so
            there is nowhere to add the record. Use an address on your own domain to verify it.
          </Notice>
        ) : (
          <>
            {verified ? (
              <p className="flex items-center gap-1.5 text-sm">
                <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-brand" />
                {domain} is verified. Last checked {formatDate(verifiedAt)}.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{domain} is not verified yet.</p>
            )}
            {verified && missingSince && (
              <Notice tone="error">
                The record was not found on {formatDate(missingSince)}. The domain stays verified
                for three days after that; add the record back before then.
              </Notice>
            )}
            <p className="text-sm text-muted-foreground">
              Add this TXT record where you manage DNS for {domain}, then check it. Keep the record
              in place: it is checked again every day, and a record missing for three days removes
              the mark. Addresses on a hosting service&apos;s domain, such as your-app.vercel.app,
              cannot take records of their own.
            </p>
            <dl className="grid gap-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Type</dt>
                <dd className="font-mono text-[13px]">TXT</dd>
              </div>
            </dl>
            <CopyField
              id="dns_name"
              label="Name"
              copyLabel="Copy name"
              value={record.name}
              hint={`Some DNS providers add ${domain} themselves. Then enter only ${record.label}.`}
            />
            <CopyField id="dns_value" label="Value" copyLabel="Copy value" value={record.value} />
            <form action={action} className="grid gap-4">
              <Feedback state={state} />
              <div>
                <Submit pendingLabel="Checking...">Check DNS</Submit>
              </div>
            </form>
          </>
        )}
      </Section>
    </div>
  );
}
