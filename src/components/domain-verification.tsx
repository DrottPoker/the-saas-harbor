"use client";

import { BadgeCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { checkDomainAction } from "@/app/domain-actions";
import { CopyField } from "./copy-field";
import { Feedback, Section, Submit } from "./forms";
import { LocalTime } from "./local-time";
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
  const t = useTranslations("domains");
  const [state, action] = useEditorAction(checkDomainAction.bind(null, saasId));
  const verified = !!domain && verifiedDomain === domain;
  return (
    <div id="domain" className="mt-2 border-t pt-8">
      <Section title={t("title")} description={t("description")}>
        {!domain || !record ? (
          <Notice>{t("noDomain")}</Notice>
        ) : (
          <>
            {verified ? (
              <p className="flex items-center gap-1.5 text-sm">
                <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-brand" />
                {/* One flex item, so the date sits in the sentence. */}
                <span>
                  {t("verified", { domain })}
                  {verifiedAt && (
                    <>
                      {" "}
                      {t.rich("lastChecked", {
                        date: () => <LocalTime format="date" value={verifiedAt} />,
                      })}
                    </>
                  )}
                </span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("notVerified", { domain })}</p>
            )}
            {verified && missingSince && (
              <Notice tone="error">
                {t.rich("missing", {
                  date: () => <LocalTime format="date" value={missingSince} />,
                })}
              </Notice>
            )}
            <p className="text-sm text-muted-foreground">{t("instructions", { domain })}</p>
            <dl className="grid gap-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">{t("type")}</dt>
                <dd className="font-mono text-[13px]">TXT</dd>
              </div>
            </dl>
            {/* Most DNS providers ask for the name without the domain, which they add. */}
            <CopyField
              id="dns_name"
              label={t("name")}
              copyLabel={t("copyName")}
              value={record.label}
              suffix={`.${domain}`}
              hint={t("nameHint", { label: record.label, domain, name: record.name })}
            />
            <CopyField
              id="dns_value"
              label={t("value")}
              copyLabel={t("copyValue")}
              value={record.value}
            />
            <form action={action} className="grid gap-4">
              <Feedback state={state} />
              <div>
                <Submit pendingLabel={t("checking")}>{t("check")}</Submit>
              </div>
            </form>
          </>
        )}
      </Section>
    </div>
  );
}
