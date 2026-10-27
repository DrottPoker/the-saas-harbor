"use client";
import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Popover } from "radix-ui";
import { Globe } from "lucide-react";
import { saveAccountLanguageAction } from "@/app/preference-actions";
import { isLocale, LOCALE_COOKIE, LOCALE_INFO, LOCALES, localizedPath } from "@/i18n/config";
import { usePagePath } from "@/i18n/client";
import {
  COMMON_CURRENCIES,
  CURRENCIES,
  CURRENCY_COOKIE,
  isCurrency,
  type Currency,
} from "@/i18n/currencies";
import { cn } from "@/lib/utils";

const YEAR = 60 * 60 * 24 * 365;
const saveChoice = (name: string, value: string) => {
  document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`;
};

const select =
  "h-9 w-full rounded-md border border-border-strong bg-surface px-2.5 text-sm text-foreground shadow-control focus-visible:outline-2 focus-visible:outline-offset-0";

/**
 * The visitor's language and currency, at the top right of every page. Both are remembered in
 * cookies. A new language loads the same page at its address in that language; a new currency
 * redraws the page.
 */
export function PreferencesMenu({
  currency,
  signedIn,
  className,
}: {
  currency: Currency;
  signedIn: boolean;
  className?: string;
}) {
  const t = useTranslations("chrome.preferences");
  const locale = useLocale();
  const path = usePagePath();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const id = useId();

  // Names in the page's language, built only when the menu opens.
  const [open, setOpen] = useState(false);
  const currencies = useMemo(() => {
    if (!open) return null;
    const names = new Intl.DisplayNames([LOCALE_INFO[locale].intl], { type: "currency" });
    const label = (code: Currency) => `${code} · ${names.of(code) ?? code}`;
    const collator = new Intl.Collator(LOCALE_INFO[locale].intl);
    return {
      common: COMMON_CURRENCIES.map((code) => ({ code, label: label(code) })),
      rest: CURRENCIES.filter((code) => !COMMON_CURRENCIES.includes(code))
        .map((code) => ({ code, label: label(code) }))
        .sort((a, b) => collator.compare(a.code, b.code)),
    };
  }, [open, locale]);

  async function chooseLanguage(value: string) {
    if (!isLocale(value) || value === locale) return;
    setBusy(true);
    saveChoice(LOCALE_COOKIE, value);
    if (signedIn) await saveAccountLanguageAction(value).catch(() => undefined);
    // A full load, since the language changes the whole document: lang, dir and fonts.
    window.location.assign(
      localizedPath(value, `${path}${window.location.search}${window.location.hash}`),
    );
  }

  function chooseCurrency(value: string) {
    if (!isCurrency(value) || value === currency) return;
    saveChoice(CURRENCY_COOKIE, value);
    router.refresh();
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={t("label", { language: LOCALE_INFO[locale].name, currency })}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground",
          className,
        )}
      >
        <Globe aria-hidden="true" className="size-4 shrink-0" />
        <span aria-hidden="true" className="whitespace-nowrap">
          {LOCALE_INFO[locale].short}
          <span className="text-faint-foreground"> · </span>
          {currency}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          aria-labelledby={`${id}-title`}
          className="z-50 grid w-72 max-w-[calc(100vw-1rem)] gap-4 rounded-lg border bg-surface p-4 text-foreground shadow-float"
        >
          <h2 id={`${id}-title`} className="text-sm font-medium">
            {t("title")}
          </h2>
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-language`} className="text-[13px] text-muted-foreground">
              {t("language")}
            </label>
            <select
              id={`${id}-language`}
              className={select}
              value={locale}
              disabled={busy}
              onChange={(event) => chooseLanguage(event.target.value)}
            >
              {LOCALES.map((code) => (
                <option key={code} value={code} lang={LOCALE_INFO[code].lang}>
                  {LOCALE_INFO[code].name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-currency`} className="text-[13px] text-muted-foreground">
              {t("currency")}
            </label>
            <select
              id={`${id}-currency`}
              className={select}
              value={currency}
              disabled={busy}
              aria-describedby={`${id}-note`}
              onChange={(event) => chooseCurrency(event.target.value)}
            >
              {currencies && (
                <>
                  <optgroup label={t("commonCurrencies")}>
                    {currencies.common.map(({ code, label }) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={t("allCurrencies")}>
                    {currencies.rest.map(({ code, label }) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </optgroup>
                </>
              )}
            </select>
            <p id={`${id}-note`} className="text-xs leading-5 text-muted-foreground">
              {t("note")}
            </p>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
