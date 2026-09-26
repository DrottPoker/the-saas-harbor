"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field } from "./forms";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

/** A read-only value with a button that copies it, such as code to paste or a DNS record. */
export function CopyField({
  id,
  label,
  value,
  hint,
  copyLabel = `Copy ${label}`,
  multiline = false,
}: {
  id: string;
  label: string;
  value: string;
  hint?: string;
  /** The button's text, which names what it copies. */
  copyLabel?: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Without clipboard access the value can still be selected in the field.
      setCopied(false);
    }
  };
  const shared = {
    id,
    readOnly: true,
    value,
    spellCheck: false,
    onFocus: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      event.currentTarget.select(),
    className: cn("font-mono text-[13px]", multiline && "min-h-0"),
  };
  return (
    <Field
      name={id}
      label={label}
      hint={hint}
      aside={
        <Button type="button" variant="ghost" size="sm" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          <span aria-live="polite">{copied ? "Copied" : copyLabel}</span>
        </Button>
      }
    >
      {multiline ? <Textarea {...shared} /> : <Input {...shared} />}
    </Field>
  );
}
