"use client";

import { useState } from "react";
import { Check, Copy, Mail } from "lucide-react";
import { Button } from "../ui/button";

// Email programs take a mailto address of about 2,000 characters at most.
const MAILTO_MAX = 1900;

/**
 * Reaching a list of accounts from the admin's own email program: every address in blind copy, so
 * no one sees the others, or all of them copied to paste there.
 */
export function EmailAccounts({ emails }: { emails: string[] }) {
  const [copied, setCopied] = useState(false);
  const list = emails.join(", ");
  const mailto = `mailto:?bcc=${encodeURIComponent(emails.join(","))}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(list);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  if (!emails.length) return null;
  const noun = emails.length === 1 ? "address" : "addresses";
  return (
    <div className="flex flex-wrap gap-2 max-sm:w-full">
      {mailto.length <= MAILTO_MAX && (
        <Button asChild>
          <a href={mailto}>
            <Mail />
            Write to {emails.length === 1 ? "them" : `all ${emails.length}`}
          </a>
        </Button>
      )}
      <Button type="button" variant="outline" onClick={copy}>
        {copied ? <Check /> : <Copy />}
        <span aria-live="polite">{copied ? "Copied" : `Copy ${emails.length} email ${noun}`}</span>
      </Button>
    </div>
  );
}
