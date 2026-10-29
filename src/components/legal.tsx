import type { Locale } from "@/i18n/config";
import { operator } from "@/lib/legal";
import { EnglishVersionLink } from "./english-version-link";

// Building blocks for the privacy policy and the terms.
export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6">
      <h2 id={`${id}-title`} className="text-lg font-semibold">
        {title}
      </h2>
      <div className="mt-3 grid gap-3 leading-7 text-foreground/85">{children}</div>
    </section>
  );
}

export function LegalList({ children }: { children: React.ReactNode }) {
  return <ul className="grid list-disc gap-2 ps-5 marker:text-faint-foreground">{children}</ul>;
}

export const legalLink = "font-medium text-foreground underline underline-offset-2";

/** The bold lead of a list item: `<b>` in the messages. */
export const legalStrong = (chunks: React.ReactNode) => (
  <strong className="font-medium text-foreground">{chunks}</strong>
);

/** A link to the English version of a page: `<link>` in the translation notice. */
export const englishLink = (path: string) => (chunks: React.ReactNode) => (
  <EnglishVersionLink href={path} className={legalLink}>
    {chunks}
  </EnglishVersionLink>
);

/** The space between two sentences joined in one paragraph: Chinese writes none. */
export const sentenceGap = (locale: Locale) => (locale === "zh" ? "" : " ");

/**
 * The version date, and on a translated page the notice that the English text is the binding
 * one.
 */
export function LegalVersion({
  updated,
  notice,
}: {
  updated: React.ReactNode;
  notice?: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 text-sm text-muted-foreground">
      <p>{updated}</p>
      {notice && <p>{notice}</p>}
    </div>
  );
}

/**
 * The operator's contact address as a link. Only for sentences shown while `operator.email` is
 * set; there is nothing to show before.
 */
export function Contact({ className = legalLink }: { className?: string }) {
  return operator.email ? (
    <a className={className} href={`mailto:${operator.email}`}>
      {operator.email}
    </a>
  ) : null;
}
