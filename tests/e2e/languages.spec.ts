import { test, expect, type Page } from "@playwright/test";
import { expectAccessible } from "./accessibility";

// The fake exchange-rate server (tests/e2e/fake-providers.mjs) gives 0.8 euros per dollar on
// 2026-09-24, and no rate for most other currencies.
const PREFERENCES = /Language and currency|Idioma y moneda|اللغة والعملة/;

async function choose(page: Page, field: "language" | "currency", value: string) {
  await page.getByRole("button", { name: PREFERENCES }).click();
  const select = page.locator(`select[id$="-${field}"]`);
  await expect(select).toBeVisible();
  await select.selectOption(value);
}

async function expectNoHorizontalScroll(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    `no horizontal scroll on ${new URL(page.url()).pathname}`,
  ).toBe(true);
}

test("visitors choose language and currency at the top right, and the site keeps both", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Get your SaaS seen.");

  // A new language loads the same page at its address in that language.
  await page.goto("/browse");
  await choose(page, "language", "es");
  await page.waitForURL("**/es/browse");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Explorar SaaS");
  // The choice is remembered: an English address leads to the Spanish page.
  await page.goto("/about");
  await expect(page).toHaveURL(/\/es\/about$/);

  // A new currency redraws the page with converted amounts and says so.
  await page.goto("/es");
  // Latin American Spanish writes US dollars as USD.
  await expect(page.getByText(/^USD\s[\d,]+$/).first()).toBeVisible();
  await choose(page, "currency", "EUR");
  await expect(page.getByText(/Importes en euro \(EUR\)/)).toBeVisible();
  await expect(page.getByText("La clasificación usa dólares estadounidenses.")).toBeVisible();
  await expect(page.getByText(/^EUR\s[\d,]+$/).first()).toBeVisible();
  expect(await page.evaluate(() => document.cookie)).toMatch(/currency=EUR/);

  // Arabic reads right to left, with the menu still at the top right of the reading direction.
  await page.keyboard.press("Escape");
  await choose(page, "language", "ar");
  await page.waitForURL(/\/ar$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("اجعل منتجك SaaS مرئيًا.");

  // Back to English and US dollars.
  await choose(page, "currency", "USD");
  await page.keyboard.press("Escape");
  await choose(page, "language", "en");
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await page.goto("/browse");
  await expect(page).toHaveURL(/\/browse$/);
});

test("a first visit follows the browser's language, and crawlers find every language", async ({
  browser,
}) => {
  for (const [locale, path] of [
    ["es-MX", "/es"],
    ["zh-CN", "/zh"],
    ["hi-IN", "/hi"],
    ["ru-RU", "/ru"],
    ["ar-EG", "/ar"],
    ["en-GB", "/"],
    ["pt-BR", "/"],
  ] as const) {
    const context = await browser.newContext({ locale });
    const page = await context.newPage();
    await page.goto("/");
    expect(new URL(page.url()).pathname, locale).toBe(path);
    await context.close();
  }

  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();
  await page.goto("/es/about");
  // Every language names the others, English as the default, and the canonical address is its own.
  const alternates = await page
    .locator('head link[rel="alternate"][hreflang]')
    .evaluateAll((links) =>
      Object.fromEntries(
        links.map((link) => [link.getAttribute("hreflang"), link.getAttribute("href")]),
      ),
    );
  for (const [hreflang, prefix] of [
    ["en", ""],
    ["zh", "/zh"],
    ["hi", "/hi"],
    ["ar", "/ar"],
    ["es", "/es"],
    ["ru", "/ru"],
    ["x-default", ""],
  ])
    expect(new URL(alternates[hreflang]!).pathname, hreflang).toBe(`${prefix}/about`);
  expect(
    new URL((await page.locator('head link[rel="canonical"]').getAttribute("href"))!).pathname,
  ).toBe("/es/about");
  const robots = await (await page.request.get("/robots.txt")).text();
  expect(robots).toContain("/ar/sitemap.xml");
  const sitemap = await (await page.request.get("/ru/sitemap.xml")).text();
  expect(sitemap).toContain("/ru/browse</loc>");
  expect(sitemap).toContain('hreflang="x-default"');
  await context.close();
});

test("pages in Arabic and Spanish are accessible at 390 and 1440 px in both themes", async ({
  page,
}) => {
  const paths = ["", "/browse", "/categories", "/about", "/list-your-saas", "/privacy", "/auth"];
  for (const locale of ["ar", "es"])
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const path of paths) {
          await page.goto(`/${locale}${path}`);
          await expect(page.locator("html")).toHaveAttribute("lang", locale);
          await expectNoHorizontalScroll(page);
          await expectAccessible(page);
        }
      }
    }
});
