import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { expectAccessible } from "./accessibility";
import { LOCALES, LOCALE_INFO, localizedPath } from "../../src/i18n/config";

// The fake exchange-rate server (tests/e2e/fake-providers.mjs) gives 0.8 euros per dollar on
// 2026-09-24, 150 yen per dollar, and no rate for most other currencies.
const PREFERENCES = /Language and currency|Idioma y moneda|اللغة والعملة|言語と通貨/;

test("crawlers receive localized metadata and structured data in the initial HTML", async ({
  request,
}) => {
  for (const locale of LOCALES) {
    for (const [path, type] of [
      ["/", "WebPage"],
      ["/categories", "CollectionPage"],
      ["/categories/design", "CollectionPage"],
      ["/tech", "CollectionPage"],
      ["/tech/nextjs", "CollectionPage"],
      ["/list-your-saas", "FAQPage"],
      ["/where-to-launch", "Article"],
    ]) {
      const address = localizedPath(locale, path);
      const response = await request.get(address, {
        headers: { "User-Agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" },
      });
      expect(response.status(), address).toBe(200);
      const html = await response.text();
      const head = html.split("</head>")[0];
      expect(head, address).toContain(
        `rel="canonical" href="http://127.0.0.1:3002${address === "/" ? "" : address}"`,
      );
      expect((head.match(/hrefLang=/g) ?? []).length, address).toBe(LOCALES.length + 1);
      const documents = [
        ...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
      ].flatMap((match) => {
        const value = JSON.parse(match[1]);
        return value["@graph"] ?? [value];
      });
      const document = documents.find((value) => value["@type"] === type);
      expect(document, address).toMatchObject({ inLanguage: LOCALE_INFO[locale].lang });
      expect(new URL(document.url).pathname, address).toBe(address);
      if (path === "/") {
        const website = documents.find((value) => value["@type"] === "WebSite");
        expect(website.inLanguage).toEqual(LOCALES.map((value) => LOCALE_INFO[value].lang));
      }
    }
  }
});

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
    ["ja-JP", "/ja"],
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
    ["ja", "/ja"],
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

for (const locale of ["ar", "es", "ja"])
  for (const theme of ["light", "dark"] as const)
    for (const width of [390, 1440])
      test(`${locale} pages are accessible at ${width} px in ${theme} mode`, async ({ page }) => {
        test.setTimeout(180000);
        const problems: string[] = [];
        let expectedNotFound = "";
        page.on("pageerror", (error) => problems.push(error.message));
        page.on("console", (message) => {
          if (
            message.location().url === expectedNotFound &&
            message.text() ===
              "Failed to load resource: the server responded with a status of 404 (Not Found)"
          )
            return;
          if (message.type() === "error") problems.push(message.text());
        });
        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize({ width, height: 900 });
        for (const path of [
          "",
          "/browse",
          "/newest",
          "/categories",
          "/categories/design",
          "/tech",
          "/tech/nextjs",
          "/demo/metricfold",
          "/stats",
          "/about",
          "/list-your-saas",
          "/where-to-launch",
          "/privacy",
          "/terms",
          "/auth",
          "/auth?mode=signup",
          "/feedback",
          "/missing",
        ]) {
          expectedNotFound =
            path === "/missing"
              ? new URL(`/${locale}${path}`, test.info().project.use.baseURL).href
              : "";
          const response = await page.goto(`/${locale}${path}`);
          expect(response?.status()).toBe(path === "/missing" ? 404 : 200);
          await expect(page.locator("html")).toHaveAttribute("lang", locale);
          await expectNoHorizontalScroll(page);
          await expectAccessible(page);
          if (!path)
            await page.screenshot({
              path: `test-results/${locale}-${theme}-${width}.png`,
              fullPage: true,
            });
        }
        expect(problems).toEqual([]);
      });

test("search and binding English legal links keep the visitor's choice", async ({ page }) => {
  await page.goto("/es/browse");
  await page.getByRole("searchbox").fill("Metricfold");
  await page.getByRole("searchbox").press("Enter");
  await expect(page).toHaveURL(/\/es\/browse\?q=Metricfold/);
  const demoTagline =
    "MRR, cancelaciones y cohortes desde tu cuenta de Stripe, sin hojas de cálculo.";
  await expect(page.getByText(demoTagline, { exact: true })).toBeVisible();
  await page.goto("/es/demo/metricfold");
  await expect(page.getByText(demoTagline, { exact: true })).toBeVisible();
  await page.goto("/es/privacy");
  await page.getByRole("link", { name: "versión en inglés", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("Japanese visitors use yen, register and receive Japanese email and form errors", async ({
  browser,
  request,
}) => {
  test.setTimeout(180000);
  const url = process.env.TEST_SUPABASE_URL!;
  const mailpit = process.env.TEST_MAILPIT_URL!;
  for (const local of [url, mailpit])
    if (!local || new URL(local).hostname !== "127.0.0.1")
      throw new Error("Only the local test stack is allowed.");
  const admin = createClient(url, process.env.TEST_SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const run = randomUUID().slice(0, 8);
  const email = `harbor-japanese-${run}@example.test`;
  const password = randomBytes(24).toString("hex");
  const context = await browser.newContext({
    locale: "ja-JP",
    extraHTTPHeaders: { "x-vercel-ip-country": "JP" },
  });
  const confirmationContext = await browser.newContext({
    locale: "en-US",
    extraHTTPHeaders: { "x-vercel-ip-country": "JP" },
  });
  let userId: string | undefined;
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/ja$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("button", { name: /言語と通貨.*JPY/ })).toBeVisible();
    await expect(page.getByText(/^￥[\d,]+$/).first()).toBeVisible();
    await expect(page.getByText(/金額は.*米ドルから.*JPY.*換算/)).toBeVisible();
    await choose(page, "currency", "EUR");
    await expect(page.getByRole("button", { name: /言語と通貨.*EUR/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await choose(page, "currency", "JPY");
    await page.keyboard.press("Escape");
    await page.goto("/ja/auth?mode=signup");
    await page.getByLabel("メールアドレス", { exact: true }).fill(email);
    await page.getByLabel("パスワード", { exact: true }).fill(password);
    await page.getByRole("button", { name: "続ける", exact: true }).click();
    await page.getByLabel("ユーザー名", { exact: true }).fill(`japanese-${run}`);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "アカウントを作成", exact: true }).click();
    await expect(page.getByRole("heading", { name: "受信トレイをご確認ください" })).toBeVisible();
    let messageId = "";
    await expect
      .poll(async () => {
        const messages = await (
          await request.get(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
        ).json();
        messageId = messages.messages[0]?.ID ?? "";
        return !!messageId;
      })
      .toBe(true);
    const message = await (await request.get(`${mailpit}/api/v1/message/${messageId}`)).json();
    expect(message.Subject).toBe("The SaaS Harborのメールアドレスを確認");
    expect(message.HTML).toContain('<html lang="ja">');
    const link = message.HTML.match(/href="([^"]*\/ja\/auth\/confirm\?[^"]*)"/)?.[1]?.replaceAll(
      "&amp;",
      "&",
    );
    expect(link).toBeTruthy();
    const signedIn = await confirmationContext.newPage();
    await signedIn.goto(link!);
    await signedIn.getByRole("button", { name: "メールアドレスを確認", exact: true }).click();
    await expect(signedIn).toHaveURL(/\/ja\/dashboard\/saas\/new$/);
    userId = (await admin.auth.admin.listUsers()).data.users.find(
      (user) => user.email === email,
    )?.id;
    expect(userId).toBeTruthy();
    const user = (await admin.auth.admin.getUserById(userId!)).data.user!;
    expect(user.user_metadata).toMatchObject({
      locale: "ja",
      currency: "JPY",
      signup_country: "JP",
    });
    await signedIn.getByLabel("プロダクト名", { exact: true }).fill(`Japanese test ${run}`);
    await signedIn
      .getByLabel("キャッチコピー", { exact: true })
      .fill("A local Japanese form fixture.");
    await signedIn
      .getByLabel("説明", { exact: true })
      .fill(
        "A product used only to check Japanese form errors and deleted with this local account.",
      );
    await signedIn.getByLabel("カテゴリー", { exact: true }).selectOption("Productivity");
    await signedIn.getByLabel("ウェブサイト", { exact: true }).fill("example.com");
    await signedIn.getByLabel("公開日", { exact: true }).fill("2025-06-01");
    await signedIn.getByRole("combobox", { name: "決済サービス", exact: true }).click();
    await signedIn.getByRole("option", { name: "Stripe", exact: true }).click();
    await signedIn.getByLabel("制限付きキー", { exact: true }).fill("not-a-stripe-key");
    await signedIn.getByRole("button", { name: "SaaSを追加して売上を検証", exact: true }).click();
    await expect(
      signedIn.getByRole("alert").filter({ hasText: /Stripe.*キー.*貼り付け/ }),
    ).toBeVisible();
    for (const theme of ["light", "dark"] as const) {
      await signedIn.emulateMedia({ colorScheme: theme });
      for (const width of [390, 1440]) {
        await signedIn.setViewportSize({ width, height: 900 });
        for (const path of [
          "/dashboard",
          "/dashboard/profile",
          "/dashboard/settings",
          "/messages",
          "/dashboard/saas/new",
        ]) {
          await signedIn.goto(`/ja${path}`);
          await expectNoHorizontalScroll(signedIn);
          await expectAccessible(signedIn);
        }
        await signedIn.screenshot({
          path: `test-results/ja-form-${theme}-${width}.png`,
          fullPage: true,
        });
      }
    }
    expect((await admin.rpc("set_admin", { p_email: email, p_admin: true })).error).toBeNull();
    await signedIn.goto(`/admin/accounts?q=${encodeURIComponent(email)}`);
    await expect(
      signedIn.getByText("Language: Japanese · Currency: JPY", { exact: true }),
    ).toBeVisible();
  } finally {
    await context.close().catch(() => undefined);
    await confirmationContext.close().catch(() => undefined);
    if (!userId)
      userId = (await admin.auth.admin.listUsers()).data.users.find(
        (user) => user.email === email,
      )?.id;
    if (userId) expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
  }
});

test("Spanish sign-up, emails, provider errors and Arabic account pages work together", async ({
  browser,
  page,
  request,
}) => {
  test.setTimeout(180000);
  const url = process.env.TEST_SUPABASE_URL!;
  const mailpit = process.env.TEST_MAILPIT_URL!;
  for (const local of [url, mailpit])
    if (!local || new URL(local).hostname !== "127.0.0.1")
      throw new Error("Only the local test stack is allowed.");
  const admin = createClient(url, process.env.TEST_SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const run = randomUUID().slice(0, 8);
  const email = `harbor-language-${run}@example.test`;
  const username = `language-${run}`;
  const password = randomBytes(24).toString("hex");
  const context = await browser.newContext({ locale: "en-US" });
  let userId: string | undefined;
  try {
    await page.goto("/es/auth?mode=signup");
    await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByLabel("Nombre de usuario", { exact: true }).fill(username);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Revisa tu bandeja de entrada" })).toBeVisible();
    let messageId = "";
    await expect
      .poll(async () => {
        const response = await request.get(
          `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
        );
        messageId = (await response.json()).messages[0]?.ID ?? "";
        return !!messageId;
      })
      .toBe(true);
    const message = await (await request.get(`${mailpit}/api/v1/message/${messageId}`)).json();
    expect(message.Subject).toBe("Confirma tu correo para The SaaS Harbor");
    expect(message.HTML).toContain('<html lang="es">');
    const link = message.HTML.match(/href="([^"]*\/es\/auth\/confirm\?[^"]*)"/)?.[1]?.replaceAll(
      "&amp;",
      "&",
    );
    expect(link).toBeTruthy();
    // Another browser has no preference cookie and prefers English; the email still opens Spanish.
    const signedIn = await context.newPage();
    await signedIn.goto(link!);
    await signedIn.getByRole("button", { name: "Confirmar correo", exact: true }).click();
    await expect(signedIn).toHaveURL(/\/es\/dashboard\/saas\/new$/);
    await expect(signedIn.locator("html")).toHaveAttribute("lang", "es");
    await expect(signedIn.getByRole("heading", { name: "Añadir SaaS", exact: true })).toBeVisible();
    const users = await admin.auth.admin.listUsers();
    const user = users.data.users.find((entry) => entry.email === email)!;
    userId = user.id;
    expect(user.user_metadata.locale).toBe("es");
    expect(user.user_metadata.currency).toBe("USD");

    await signedIn.getByLabel("Nombre del producto", { exact: true }).fill(`Language test ${run}`);
    await signedIn
      .getByLabel("Eslogan", { exact: true })
      .fill("A product used only for local language tests.");
    await signedIn
      .getByLabel("Descripción", { exact: true })
      .fill("This product verifies translated forms and is deleted when this local test ends.");
    await signedIn.getByLabel("Categoría", { exact: true }).selectOption("Productivity");
    await signedIn.getByLabel("Sitio web", { exact: true }).fill("example.com");
    await signedIn.getByLabel("Fecha de lanzamiento", { exact: true }).fill("2025-06-01");
    await signedIn.getByRole("combobox", { name: "Proveedor de pagos" }).click();
    await signedIn.getByRole("option", { name: "Stripe", exact: true }).click();
    await signedIn.getByLabel("Clave restringida", { exact: true }).fill("not-a-stripe-key");
    await signedIn
      .getByRole("button", { name: "Añadir SaaS y verificar ingresos", exact: true })
      .click();
    await expect(
      signedIn.getByRole("alert").filter({ hasText: "Pega una clave restringida de Stripe." }),
    ).toBeVisible();

    // Background verification stores English notes; the editor translates them when read.
    const productId = randomUUID();
    expect(
      (
        await admin.from("saas").insert({
          id: productId,
          owner_id: userId,
          name: `Stored notes ${run}`,
          tagline: "A local fixture for translated verification notes.",
          description:
            "This product only tests stored notes and is deleted with the local test account.",
          category: "Productivity",
          website: "https://example.com",
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await admin.from("revenue_connections").insert({
          saas_id: productId,
          owner_id: userId,
          provider: "stripe",
          encrypted_key: "v1:language-fixture",
          key_hint: "rk_test_fixture",
          livemode: false,
          status: "error",
          last_error: "Stripe rejected the key. It may have been revoked.",
          revenue_note:
            "The Stripe account has more invoices than one verification reads, so there is no revenue history.",
        })
      ).error,
    ).toBeNull();
    await signedIn.goto(`/es/dashboard/saas/${productId}`);
    await expect(
      signedIn.getByText("Stripe rechazó la clave. Es posible que se haya revocado.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      signedIn.getByText(
        "La cuenta de Stripe tiene más facturas de las que permite una verificación, así que no se ofrece el historial de ingresos.",
        { exact: true },
      ),
    ).toBeVisible();

    await choose(signedIn, "language", "ar");
    await expect(signedIn).toHaveURL(new RegExp(`/ar/dashboard/saas/${productId}$`));
    await expect(
      signedIn.getByText("رفض Stripe المفتاح. ربما أُلغي.", { exact: true }),
    ).toBeVisible();
    expect((await admin.auth.admin.getUserById(userId)).data.user?.user_metadata.locale).toBe("ar");
    for (const theme of ["light", "dark"] as const) {
      await signedIn.emulateMedia({ colorScheme: theme });
      for (const width of [390, 1440]) {
        await signedIn.setViewportSize({ width, height: 900 });
        for (const path of [
          "/dashboard",
          "/dashboard/profile",
          "/dashboard/settings",
          "/messages",
          `/dashboard/saas/${productId}`,
          "/dashboard/saas/new",
        ]) {
          await signedIn.goto(`/ar${path}`);
          await expect(signedIn.locator("html")).toHaveAttribute("dir", "rtl");
          await expectNoHorizontalScroll(signedIn);
          await expectAccessible(signedIn);
        }
        await signedIn.screenshot({
          path: `test-results/ar-form-${theme}-${width}.png`,
          fullPage: true,
        });
        await signedIn.getByRole("button", { name: PREFERENCES }).click();
        await expectAccessible(signedIn);
        await signedIn.screenshot({
          path: `test-results/ar-preferences-${theme}-${width}.png`,
          fullPage: true,
        });
        await signedIn.keyboard.press("Escape");
      }
    }
    // Currency changes keep the email language, and admins read both saved choices.
    await choose(signedIn, "currency", "EUR");
    await expect
      .poll(
        async () => (await admin.auth.admin.getUserById(userId!)).data.user?.user_metadata.currency,
      )
      .toBe("EUR");
    expect((await admin.auth.admin.getUserById(userId)).data.user?.user_metadata.locale).toBe("ar");
    expect((await admin.rpc("set_admin", { p_email: email, p_admin: true })).error).toBeNull();
    for (const theme of ["light", "dark"] as const) {
      await signedIn.emulateMedia({ colorScheme: theme });
      for (const width of [390, 1440]) {
        await signedIn.setViewportSize({ width, height: 900 });
        await signedIn.goto(`/admin/accounts?q=${encodeURIComponent(email)}`);
        await expect(
          signedIn
            .getByRole("list", { name: "Accounts", exact: true })
            .getByText("Language: Arabic · Currency: EUR", { exact: true }),
        ).toBeVisible();
        await expectNoHorizontalScroll(signedIn);
        await expectAccessible(signedIn);
        await signedIn.screenshot({
          path: `test-results/account-preferences-list-${theme}-${width}.png`,
          fullPage: true,
        });
        await signedIn.goto(`/admin/accounts/${userId}`);
        const facts = signedIn.getByRole("region", { name: "Account", exact: true });
        await expect(facts.getByText("Arabic", { exact: true })).toBeVisible();
        await expect(facts.getByText("EUR", { exact: true })).toBeVisible();
        await expectNoHorizontalScroll(signedIn);
        await expectAccessible(signedIn);
        await signedIn.screenshot({
          path: `test-results/account-preferences-detail-${theme}-${width}.png`,
          fullPage: true,
        });
      }
    }
    // Signing in elsewhere records that browser's detected currency and page language.
    const login = await page.context().newPage();
    await login.goto("/ru/auth");
    await login.locator("#email").fill(email);
    await login.locator("#password").fill(password);
    await login.locator('button[type="submit"]').click();
    await expect(login).toHaveURL(/\/ru\/dashboard$/);
    expect((await admin.auth.admin.getUserById(userId)).data.user?.user_metadata.locale).toBe("ru");
    expect((await admin.auth.admin.getUserById(userId)).data.user?.user_metadata.currency).toBe(
      "USD",
    );
  } finally {
    await context.close().catch(() => undefined);
    // A failure before confirmation still leaves an Auth account that must be removed.
    if (!userId)
      userId = (await admin.auth.admin.listUsers()).data.users.find(
        (entry) => entry.email === email,
      )?.id;
    if (userId) expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
  }
});
