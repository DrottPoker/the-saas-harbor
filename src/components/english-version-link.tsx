"use client";
import type { ReactNode } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE } from "@/i18n/config";

const YEAR = 60 * 60 * 24 * 365;

// The proxy sends a visitor from an English address to the language they chose or their browser
// prefers, so a plain link would come back to the translation. Choosing English first, as the
// language menu does, lets the link reach the English page.
function chooseEnglish() {
  document.cookie = `${LOCALE_COOKIE}=${DEFAULT_LOCALE}; path=/; max-age=${YEAR}; samesite=lax`;
}

/** A link to the English version of a page, for a translated page whose English text is binding. */
export function EnglishVersionLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      hrefLang={DEFAULT_LOCALE}
      className={className}
      onClick={chooseEnglish}
      onAuxClick={chooseEnglish}
    >
      {children}
    </a>
  );
}
