import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";
import {
  isLocalizedPath,
  LOCALE_INFO,
  LOCALES,
  localizedPath,
  splitLocale,
} from "../../src/i18n/config";
import { COUNTRY_CURRENCY, CURRENCIES, countryCurrency } from "../../src/i18n/currencies";
import { detectCurrency, negotiateLocale, savedCurrency } from "../../src/i18n/detect";
import { formatList } from "../../src/i18n/list";
import { categoryKey } from "../../src/i18n/names";
import {
  formatCount,
  formatMoney,
  formatUsdIn,
  usdMoney,
  type Money,
} from "../../src/lib/display-money";
import { languageAlternates } from "../../src/lib/seo";

describe("the language of a first visit", () => {
  it("takes the browser's most preferred language the site has", () => {
    expect(negotiateLocale("es-MX,es;q=0.9,en;q=0.8")).toBe("es");
    expect(negotiateLocale("zh-CN,zh;q=0.9")).toBe("zh");
    expect(negotiateLocale("hi-IN")).toBe("hi");
    expect(negotiateLocale("ar-EG,ar;q=0.9")).toBe("ar");
    expect(negotiateLocale("ru")).toBe("ru");
    expect(negotiateLocale("en-IN,hi;q=0.9")).toBe("en");
  });
  it("follows the weights, then the order", () => {
    expect(negotiateLocale("en;q=0.5,ru;q=0.8")).toBe("ru");
    expect(negotiateLocale("fr,ru;q=0.9,es;q=0.9")).toBe("ru");
    expect(negotiateLocale("es;q=0,ru")).toBe("ru");
  });
  it("skips languages it does not have, and Traditional Chinese", () => {
    expect(negotiateLocale("pt-BR,pt;q=0.9,es;q=0.8")).toBe("es");
    expect(negotiateLocale("zh-TW,zh;q=0.9,en;q=0.8")).toBe("zh");
    expect(negotiateLocale("zh-TW,en;q=0.8")).toBe("en");
    expect(negotiateLocale("zh-Hant-HK")).toBe("en");
  });
  it("is English without a usable header", () => {
    for (const header of [null, undefined, "", "*", "fr-FR", "x-klingon", "es;q=abc"])
      expect(negotiateLocale(header), String(header)).toBe("en");
  });
});

describe("the currency of a first visit", () => {
  it("is the currency of the visitor's country", () => {
    expect(detectCurrency("IN", null)).toBe("INR");
    expect(detectCurrency("br", null)).toBe("BRL");
    expect(detectCurrency("DE", "en-US")).toBe("EUR");
    expect(detectCurrency("EC", null)).toBe("USD");
    expect(detectCurrency("NG", null)).toBe("NGN");
    expect(detectCurrency("RU", null)).toBe("RUB");
  });
  it("is USD where the official rate would mislead", () => {
    for (const country of ["VE", "IR", "SY", "LB", "CU", "KP"])
      expect(detectCurrency(country, null), country).toBe("USD");
  });
  it("falls back to the region of the browser's language, then USD", () => {
    expect(detectCurrency(null, "es-MX,es;q=0.9")).toBe("MXN");
    expect(detectCurrency("XX", "en-GB")).toBe("GBP");
    expect(detectCurrency(null, "es,en;q=0.5")).toBe("USD");
    expect(detectCurrency(null, null)).toBe("USD");
  });
  it("maps every country to a currency the menu offers or to USD", () => {
    for (const [country, currency] of Object.entries(COUNTRY_CURRENCY)) {
      const shown = countryCurrency(country);
      expect([currency, "USD"]).toContain(shown);
      expect(CURRENCIES).toContain(shown);
    }
  });
  it("accepts only offered currencies as a saved choice", () => {
    expect(savedCurrency("eur")).toBe("EUR");
    expect(savedCurrency("VES")).toBeNull();
    expect(savedCurrency("BTC")).toBeNull();
    expect(savedCurrency(undefined)).toBeNull();
  });
});

describe("addresses in other languages", () => {
  it("add a prefix for every language but English", () => {
    expect(localizedPath("en", "/browse")).toBe("/browse");
    expect(localizedPath("es", "/browse")).toBe("/es/browse");
    expect(localizedPath("ar", "/")).toBe("/ar");
    expect(localizedPath("zh", "/?by=all")).toBe("/zh?by=all");
    expect(localizedPath("ru", "/saas/querybird?x=1#top")).toBe("/ru/saas/querybird?x=1#top");
  });
  it("replace a prefix rather than adding a second one", () => {
    expect(localizedPath("hi", "/es/browse")).toBe("/hi/browse");
    expect(localizedPath("en", "/es/browse")).toBe("/browse");
  });
  it("leave files, routes for machines, the admin panel and other sites alone", () => {
    for (const path of [
      "/api/analytics",
      "/llms.txt",
      "/saas/querybird.md",
      "/saas/querybird/badge.svg",
      "/sitemap.xml",
      "/admin/products",
      "/auth/callback?code=1",
      "/auth/oauth/google",
      "/saas/querybird/opengraph-image",
      "https://example.com/",
      "//example.com/",
    ]) {
      expect(isLocalizedPath(path), path).toBe(false);
      expect(localizedPath("es", path)).toBe(path);
    }
    expect(isLocalizedPath("/auth/confirm?token_hash=1")).toBe(true);
  });
  it("split into the language and the English path", () => {
    expect(splitLocale("/es/browse")).toEqual({ locale: "es", path: "/browse" });
    expect(splitLocale("/ar")).toEqual({ locale: "ar", path: "/" });
    expect(splitLocale("/browse")).toEqual({ locale: null, path: "/browse" });
    expect(splitLocale("/esx")).toEqual({ locale: null, path: "/esx" });
    expect(splitLocale("/fr/browse")).toEqual({ locale: null, path: "/fr/browse" });
  });
  it("name every language for search engines, English as the default", () =>
    expect(languageAlternates("/saas/querybird")).toEqual({
      en: "/saas/querybird",
      zh: "/zh/saas/querybird",
      hi: "/hi/saas/querybird",
      ar: "/ar/saas/querybird",
      es: "/es/saas/querybird",
      ru: "/ru/saas/querybird",
      "x-default": "/saas/querybird",
    }));
});

// Intl puts no-break spaces between digits and symbols.
const noBreak = new RegExp(`[${String.fromCharCode(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(noBreak, " ");

describe("amounts in the visitor's currency", () => {
  const eur: Money = { currency: "EUR", rate: 0.92, date: "2026-10-27", locale: "es-419" };
  it("keep USD as stored, with cents when there are any", () => {
    expect(plain(formatMoney(420_000, usdMoney()))).toBe("$4,200");
    expect(plain(formatMoney(150_050, usdMoney()))).toBe("$1,500.50");
    expect(plain(formatUsdIn(420_000, "ru-RU"))).toBe("4 200 $");
  });
  it("convert at the rate and round large converted amounts to whole units", () => {
    expect(plain(formatMoney(420_000, eur))).toBe("EUR 3,864");
    expect(plain(formatMoney(1_234, eur))).toBe("EUR 11.35");
    expect(plain(formatMoney(1_087, eur))).toBe("EUR 10");
  });
  it("use the currency's own decimals", () => {
    const yen: Money = { currency: "JPY", rate: 150, date: "2026-10-27", locale: "en-US" };
    expect(plain(formatMoney(499, yen))).toBe("¥749");
  });
  it("write numbers the way the language does", () => {
    const inr: Money = { currency: "INR", rate: 95, date: "2026-10-27", locale: "hi-IN" };
    expect(plain(formatMoney(420_000, inr))).toBe("₹3,99,000");
    const egp: Money = {
      currency: "EGP",
      rate: 50,
      date: "2026-10-27",
      locale: LOCALE_INFO.ar.intl,
    };
    expect(plain(formatMoney(420_000, egp))).toMatch(/210,000/);
    expect(plain(formatCount(1234, LOCALE_INFO.ar.intl))).toBe("1,234");
  });
  it("shorten amounts for chart axes and round reconstructed ones", () => {
    expect(plain(formatMoney(420_000, usdMoney(), "compact"))).toBe("$4.2K");
    expect(plain(formatMoney(420_049, usdMoney(), "whole"))).toBe("$4,200");
  });
});

describe("lists of names", () => {
  it("join as the language does, without the comma before and in English", () => {
    expect(formatList(["Stripe", "Paddle", "Polar"], "en")).toBe("Stripe, Paddle and Polar");
    expect(formatList(["Stripe", "Paddle", "Polar"], "es")).toBe("Stripe, Paddle y Polar");
    expect(formatList(["Stripe", "Paddle"], "en", "disjunction")).toBe("Stripe or Paddle");
  });
});

describe("category names", () => {
  it("have a message key for every stored name, Other for unknown ones", () => {
    expect(categoryKey("Developer Tools")).toBe("names.developer-tools");
    expect(categoryKey("AI & Machine Learning")).toBe("names.ai-machine-learning");
    expect(categoryKey("Gardening")).toBe("names.other");
    expect(categoryKey(null)).toBe("names.other");
  });
});

// Every language has exactly the English keys, with the same arguments and tags, valid ICU
// syntax, and no em dash (the owner's style for every text).
type Tree = { [key: string]: string | Tree };
const messagesDir = join(__dirname, "../../src/messages");
const read = (locale: string, namespace: string): Tree =>
  JSON.parse(readFileSync(join(messagesDir, locale, `${namespace}.json`), "utf8"));
const namespaces = readdirSync(join(messagesDir, "en"))
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.slice(0, -5));

function leaves(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [[`${prefix}${key}`, value]] : leaves(value, `${prefix}${key}.`),
  );
}

function argumentsOf(elements: MessageFormatElement[], found = new Set<string>()) {
  for (const element of elements) {
    if (
      element.type === TYPE.argument ||
      element.type === TYPE.number ||
      element.type === TYPE.date
    )
      found.add(element.value);
    if (element.type === TYPE.tag) {
      found.add(`<${element.value}>`);
      argumentsOf(element.children, found);
    }
    if (element.type === TYPE.plural || element.type === TYPE.select) {
      found.add(element.value);
      for (const option of Object.values(element.options)) argumentsOf(option.value, found);
    }
  }
  return found;
}

describe("translations", () => {
  it("cover every namespace in every language", () => {
    for (const locale of LOCALES)
      expect(
        readdirSync(join(messagesDir, locale))
          .filter((f) => f.endsWith(".json"))
          .sort(),
        locale,
      ).toEqual(namespaces.map((n) => `${n}.json`).sort());
  });

  for (const namespace of namespaces) {
    it(`have the English keys and arguments in ${namespace}`, () => {
      const english = new Map(leaves(read("en", namespace)));
      for (const locale of LOCALES) {
        const translated = new Map(leaves(read(locale, namespace)));
        expect([...translated.keys()].sort(), `${locale}/${namespace}`).toEqual(
          [...english.keys()].sort(),
        );
        for (const [key, text] of translated) {
          const where = `${locale}/${namespace}.${key}`;
          expect(text.trim(), where).not.toBe("");
          expect(text, where).not.toContain("—");
          const parsed = parse(text);
          // Chinese has no plural forms, so a translation may give the number alone.
          expect(argumentsOf(parsed), where).toEqual(argumentsOf(parse(english.get(key)!)));
        }
      }
    });
  }
});
