import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { DODO_KEYS, PADDLE_KEYS, POLAR_TOKENS } from "./fake-billing.mjs";
import { termsUpdated } from "../../src/lib/legal";

const url = process.env.TEST_SUPABASE_URL!;
const mailpit = process.env.TEST_MAILPIT_URL!;
for (const local of [url, mailpit]) {
  if (!local || new URL(local).hostname !== "127.0.0.1")
    throw new Error("Only the local test stack is allowed.");
}
const admin = createClient(url, process.env.TEST_SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const anon = createClient(url, publicKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const run = randomUUID().slice(0, 8);
const email = `harbor-${run}@example.test`;
const password = randomBytes(24).toString("hex");
const secondEmail = `harbor-second-${run}@example.test`;
const secondPassword = randomBytes(24).toString("hex");
const leavingEmail = `harbor-leaving-${run}@example.test`;
const leavingPassword = randomBytes(24).toString("hex");
const userIds: string[] = [];
const productName = `Harbor test ${run}`;
let productId = "";
let firstUserId = "";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=",
  "base64",
);

async function login(page: Page, address: string, pass: string) {
  await page.goto("/auth");
  await page.getByLabel("Email address").fill(address);
  await page.getByLabel("Password", { exact: true }).fill(pass);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function fillProduct(page: Page, name: string) {
  await page.getByLabel("Product name", { exact: true }).fill(name);
  await page.getByLabel("Tagline").fill("A product created only by the local integration test.");
  await page
    .getByLabel("Description")
    .fill("This is an isolated local integration fixture and is removed after verification.");
  await page.getByLabel("Website", { exact: true }).fill("https://example.com");
}
async function expectNoHorizontalScroll(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    `no horizontal scroll on ${new URL(page.url()).pathname}`,
  ).toBe(true);
}
async function setThemeCookie(page: Page, theme: "light" | "dark") {
  await page
    .context()
    .addCookies([{ name: "theme", value: theme, url: new URL(page.url()).origin }]);
}
async function pageBackground(page: Page) {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}
// Notification emails in Mailpit for one address, newest first.
async function inbox(request: APIRequestContext, address: string) {
  const query = encodeURIComponent(`to:"${address}"`);
  const response = await request.get(`${mailpit}/api/v1/search?query=${query}`);
  return (await response.json()).messages as { ID: string; Subject: string }[];
}
async function emailText(request: APIRequestContext, id: string) {
  return (await (await request.get(`${mailpit}/api/v1/message/${id}`)).json()) as {
    Text: string;
    HTML: string;
  };
}
// Runs the scheduled email job, which sends what is due.
async function sendDueEmails(request: APIRequestContext) {
  const response = await request.post("/api/email/send", {
    headers: { Authorization: `Bearer ${process.env.TEST_CRON_SECRET}` },
  });
  expect(response.status()).toBe(200);
  expect((await response.json()).configured).toBe(true);
}
// A page logs a console error for everything the Content Security Policy blocks.
function watchPolicy(page: Page, violations: string[]) {
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy/i.test(message.text()))
      violations.push(`${new URL(page.url()).pathname}: ${message.text()}`);
  });
}
// Auth emails link to the app's confirm page with a one-time token.
function confirmLink(html: string) {
  const link = html.match(/href="([^"]*\/auth\/confirm\?[^"]*)"/)?.[1]?.replaceAll("&amp;", "&");
  if (!link?.startsWith(`${test.info().project.use.baseURL}/auth/confirm?token_hash=`))
    throw new Error("A local confirm link is required.");
  return link;
}
async function expectAccessible(page: Page) {
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect
    .soft(
      accessibility.violations.map((issue) => ({
        page: new URL(page.url()).pathname,
        id: issue.id,
        nodes: issue.nodes.map((node) => node.target),
      })),
    )
    .toEqual([]);
}

test.describe.configure({ mode: "serial" });
// The test server compiles each route on its first request, which can take longer than an
// expectation waits when the machine is busy. Every route is requested once before the tests, so
// their waits measure the app and not the compiler. None of these requests changes data.
test.beforeAll(async ({ playwright }, info) => {
  test.setTimeout(300000);
  const client = await playwright.request.newContext({ baseURL: info.project.use.baseURL });
  const id = randomUUID();
  for (const path of [
    ...["/", "/discover", "/newest", "/about", "/privacy", "/terms", "/account-deleted"],
    ...["/auth", "/auth/confirm", `/saas/${id}`, `/users/${id}`, "/demo/metricfold", "/missing"],
    ...["/dashboard", "/dashboard/profile", "/dashboard/reports", `/dashboard/saas/${id}`],
    ...["/dashboard/settings", "/api/email/send", "/api/analytics", "/admin/analytics/data"],
    ...["/messages", `/messages/${id}`, `/report/saas/${id}`, "/api/revenue/sync"],
    ...["/sitemap.xml", "/robots.txt", "/opengraph-image", "/llms.txt"],
    ...["/categories", "/categories/design", "/saas/any.md", "/users/any.md"],
    ...["/stats", "/stats/opengraph-image", "/feedback"],
    ...["/saas/any/opengraph-image", "/users/any/opengraph-image", "/saas/any/badge.svg"],
    ...["", "/analytics", "/reports", "/feedback", "/products", "/accounts", "/log"].map(
      (section) => `/admin${section}`,
    ),
    ...["reports", "products", "accounts"].map((section) => `/admin/${section}/${id}`),
  ])
    await client.get(path, { maxRedirects: 0 });
  await client.dispose();
});
test.afterAll(async () => {
  const { data } = await admin.auth.admin.listUsers();
  for (const user of data.users.filter((user) =>
    [email, secondEmail, leavingEmail].includes(user.email ?? ""),
  )) {
    if (!userIds.includes(user.id)) userIds.push(user.id);
  }
  for (const id of userIds) {
    const { data: images } = await admin.storage.from("profile-images").list(id);
    if (images?.length)
      await admin.storage
        .from("profile-images")
        .remove(images.map((image) => `${id}/${image.name}`));
    const { error } = await admin.auth.admin.deleteUser(id);
    // A user may already have deleted their own account.
    if (error && error.status !== 404) throw new Error("Local fixture cleanup failed.");
  }
});

// The local database may hold demo data from `npm run db:seed`, so tests never assume it is empty.
test("anonymous navigation, private route protection and responsive empty state", async ({
  page,
}) => {
  const violations: string[] = [];
  watchPolicy(page, violations);
  // Every response carries a Content Security Policy with a fresh nonce for its scripts.
  const nonceOf = (policy: string | undefined) =>
    policy?.match(/script-src 'self' 'nonce-([A-Za-z0-9+/=]+)' 'strict-dynamic'/)?.[1];
  const first = nonceOf((await page.goto("/"))?.headers()["content-security-policy"]);
  expect(first).toBeTruthy();
  const second = nonceOf((await page.reload())?.headers()["content-security-policy"]);
  expect(second).toBeTruthy();
  expect(second).not.toBe(first);
  // The home page tells founders what they get, and every way to list a product starts with
  // creating an account.
  await expect(
    page.getByRole("heading", { name: /^Get your SaaS seen\.\s*List it for free\.$/, level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Free for every SaaS" })).toContainText(
    "No payment details and no revenue check needed.",
  );
  await expect(page.getByRole("heading", { name: "Leaderboard", level: 2 })).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: "List your SaaS", exact: true }),
  ).toHaveAttribute("href", "/auth?mode=signup");
  await expect(
    page.getByRole("banner").getByRole("link", { name: "List your SaaS" }),
  ).toHaveAttribute("href", "/auth?mode=signup");
  await page.goto("/dashboard/saas/new");
  await expect(page).toHaveURL("/auth?mode=signup");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/auth",
  );
  // Crawlers get the sitemap and stay out of private areas.
  const origin = test.info().project.use.baseURL!;
  const robots = await (await page.request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /admin");
  expect(robots).toContain(`Sitemap: ${origin}/sitemap.xml`);
  const sitemap = await page.request.get("/sitemap.xml");
  expect(sitemap.headers()["content-type"]).toContain("xml");
  expect(await sitemap.text()).toContain(`<loc>${origin}/discover</loc>`);
  expect(await sitemap.text()).not.toContain("/demo/");
  expect(await sitemap.text()).toContain(`<loc>${origin}/categories</loc>`);
  expect(robots).toContain("Disallow: /md/");
  // AI assistants get a guide to the site, linked from every page.
  const llms = await page.request.get("/llms.txt");
  expect(llms.headers()["content-type"]).toBe("text/plain; charset=utf-8");
  expect(await llms.text()).toContain(`- [Categories](${origin}/categories)`);
  await expect(
    page.getByRole("contentinfo").getByRole("link", { name: "For AI assistants" }),
  ).toHaveAttribute("href", "/llms.txt");
  // Every category has a page; others are not found.
  await page.goto("/categories");
  await page.getByRole("link", { name: /^AI & Machine Learning/ }).click();
  await expect(page).toHaveURL("/categories/ai-machine-learning");
  await expect(
    page.getByRole("heading", { name: "AI & Machine Learning SaaS", level: 1 }),
  ).toBeVisible();
  await page.goto("/categories/crypto");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth$/);
  await page.goto(`/discover?category=Design&q=missing-${run}`);
  await expect(page.getByRole("heading", { name: "No matching products" })).toBeVisible();
  // A page past the last one is empty rather than an error, and a repeated search reads its first.
  await page.goto("/discover?page=999");
  await expect(page.getByRole("heading", { name: "No matching products" })).toBeVisible();
  await page.goto(`/?q=missing-${run}&q=other`);
  await expect(page.getByRole("heading", { name: "No matching products" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/",
    "/discover",
    "/categories",
    "/categories/design",
    "/auth",
    "/privacy",
    "/terms",
  ]) {
    await page.goto(path);
    await expectNoHorizontalScroll(page);
  }
  await page.goto("/");
  await page.screenshot({ path: "test-results/mobile-home.png", fullPage: true, caret: "initial" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/desktop-home.png",
    fullPage: true,
    caret: "initial",
  });
  await expectAccessible(page);
  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { name: "Privacy policy", level: 1 })).toBeVisible();
  await page.getByRole("contentinfo").getByRole("link", { name: "Terms" }).click();
  await expect(page.getByRole("heading", { name: "Terms", level: 1 })).toBeVisible();
  const publicPages = [
    "/discover",
    "/newest",
    "/categories",
    "/categories/design",
    "/about",
    "/privacy",
    "/terms",
    "/account-deleted",
    "/auth",
    "/auth?mode=signup",
    `/auth/confirm?token_hash=${"a".repeat(56)}&type=email`,
    "/auth/confirm",
    "/missing",
  ];
  for (const path of publicPages) {
    await page.goto(path);
    await expectAccessible(page);
  }
  expect(violations).toEqual([]);
});

// Demo products fill the lists until a full page of real products shares verified MRR. The local
// database may already hold that many, so the test checks whichever state it finds.
test("demo products fill the lists without a rank, until real products take their place", async ({
  page,
}) => {
  const { count, error } = await admin
    .from("leaderboard")
    .select("id", { count: "exact", head: true });
  if (error || count == null) throw new Error("Unable to count ranked products.");
  await page.goto("/");
  const heading = page.getByRole("heading", { name: "Demo products" });
  if (count >= 12) {
    await expect(heading).toHaveCount(0);
    await page.goto("/demo/metricfold");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    return;
  }
  const violations: string[] = [];
  watchPolicy(page, violations);
  // The leaderboard's first page is filled after the real products, and demo rows have no rank.
  // The list's heading is for screen readers only, and the rows carry no Demo tag.
  await expect(heading).toHaveClass("sr-only");
  await expect(page.getByText("Examples of how products appear here")).toHaveCount(0);
  const rows = page.getByRole("list", { name: "Demo products" }).getByRole("listitem");
  await expect(rows).toHaveCount(Math.min(13, 12 - count));
  for (const row of await rows.all()) {
    await expect(row.getByText("Demo", { exact: true })).toHaveCount(0);
    await expect(row.getByText("Demo MRR", { exact: true })).toBeAttached();
    await expect(row.getByText("Rank", { exact: true })).toHaveCount(0);
  }
  await expect(rows.first().getByRole("link")).toHaveAttribute("href", "/demo/metricfold");
  // The search and the categories apply to them as to real products.
  await page.goto("/?q=CRONHAWK");
  await expect(rows).toHaveCount(1);
  await page.goto("/discover?category=Finance");
  await expect(page.getByRole("link", { name: /Retrywell/ })).toHaveAttribute(
    "href",
    "/demo/retrywell",
  );
  await page.goto("/newest");
  await expect(heading).toBeAttached();

  // A demo page carries the Demo tag, stays out of search engines and offers no way to contact
  // anyone.
  await page.goto("/demo/metricfold");
  await expect(page).toHaveTitle(/^Metricfold \(demo\)/);
  await expect(page.getByRole("heading", { name: "Metricfold", level: 1 })).toBeVisible();
  await expect(page.getByText("Demo", { exact: true })).toBeVisible();
  await expect(page.getByText("This is a demo product.")).toHaveCount(0);
  await expect(page.getByText("Demo figures, made up for this example")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page.getByRole("group", { name: /MRR at month end/ })).toBeVisible();
  for (const text of [
    "Send message",
    "Visit website",
    "Report this product",
    "through a read-only key",
  ])
    await expect(page.getByText(text)).toHaveCount(0);
  await page.goto("/demo/missing");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();

  for (const theme of ["dark", "light"] as const) {
    await setThemeCookie(page, theme);
    for (const path of [
      "/",
      "/discover",
      "/newest",
      "/about",
      "/demo/metricfold",
      "/demo/hourbridge",
    ]) {
      await page.goto(path);
      await expectAccessible(page);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/discover", "/demo/metricfold"]) {
    await page.goto(path);
    await expectNoHorizontalScroll(page);
  }
  expect(violations).toEqual([]);
});

test("theme menu persists light and dark, and system follows the OS", async ({ page }) => {
  const light = "rgb(246, 245, 241)";
  const dark = "rgb(27, 31, 36)";
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  expect(await pageBackground(page)).toBe(light);
  await page.getByRole("button", { name: "Theme" }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await pageBackground(page)).toBe(dark);
  // The inline script restores the saved choice before paint on a full reload.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await pageBackground(page)).toBe(dark);
  for (const path of [
    "/",
    "/discover",
    "/newest",
    "/categories",
    "/categories/design",
    "/about",
    "/privacy",
    "/terms",
    "/auth",
    "/missing",
  ]) {
    await page.goto(path);
    await expectAccessible(page);
  }
  await page.getByRole("button", { name: "Theme" }).click();
  await page.getByRole("menuitemradio", { name: "System" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await pageBackground(page)).toBe(dark);
  await page.emulateMedia({ colorScheme: "light" });
  expect(await pageBackground(page)).toBe(light);
  await page.reload();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
});

test("registration, email confirmation, profile and SaaS editing, storage, privacy and logout", async ({
  browser,
  page,
  request,
}) => {
  test.setTimeout(180000);
  await page.goto("/auth?mode=signup");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  // The Terms of Service box is required, and the server refuses a sign-up without it too.
  const terms = page.getByLabel(/agree to the Terms of Service/);
  await expect(terms).toHaveAttribute("required", "");
  await terms.evaluate((box) => box.removeAttribute("required"));
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Tick the box to accept the Terms of Service." }),
  ).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await terms.check();
  await page.getByRole("button", { name: "Create account" }).click();
  // Then only the username is asked for, in the same place, and the account is created with it.
  const username = page.getByLabel("Username");
  await expect(username).toBeFocused();
  await username.fill("admin");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "That username is reserved." }),
  ).toBeVisible();
  await username.fill(`@Tester-${run}`);
  await page.getByRole("button", { name: "Continue" }).click();
  // The form gives way to what to do next, naming the address the link went to.
  const sent = page.getByRole("heading", { name: "Check your inbox" });
  await expect(sent).toBeFocused();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(page.getByLabel("Username")).toHaveCount(0);
  let messageId = "";
  await expect
    .poll(async () => {
      const response = await request.get(`${mailpit}/api/v1/messages`);
      const mailbox = await response.json();
      const message = mailbox.messages.find((item: { To: { Address: string }[] }) =>
        item.To.some((to) => to.Address === email),
      );
      messageId = message?.ID ?? "";
      return !!messageId;
    })
    .toBe(true);
  const message = await (await request.get(`${mailpit}/api/v1/message/${messageId}`)).json();
  expect(message.Subject).toBe("Confirm your email for The SaaS Harbor");
  const confirmation = confirmLink(message.HTML);
  // The link works in another browser than the one used to sign up, and only once.
  const elsewhere = await (await browser.newContext()).newPage();
  await elsewhere.goto(confirmation);
  await expect(elsewhere.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
  await elsewhere.getByRole("button", { name: "Confirm email" }).click();
  // A new account starts by listing its first product.
  await expect(elsewhere).toHaveURL(/\/dashboard\/saas\/new$/);
  await expect(elsewhere.getByRole("heading", { name: "Add a SaaS" })).toBeVisible();
  await elsewhere.goto(confirmation);
  await elsewhere.getByRole("button", { name: "Confirm email" }).click();
  await expect(
    elsewhere.getByRole("alert").filter({ hasText: "has already been used" }),
  ).toBeVisible();
  await elsewhere.context().close();
  await login(page, email, password);
  const users = await admin.auth.admin.listUsers();
  const signedUp = users.data.users.find((user) => user.email === email)!;
  firstUserId = signedUp.id;
  userIds.push(firstUserId);
  // Sign-up sends the accepted version, which the database records (terms.test.sql).
  expect(signedUp.user_metadata.terms_version).toBe(termsUpdated);
  // The username, typed with an @ and capitals, is the profile's name and address to begin with.
  await page.goto(`/users/tester-${run}`);
  await expect(page.getByRole("heading", { name: `tester-${run}`, exact: true })).toBeVisible();
  await expect(page.getByText(`@tester-${run}`, { exact: true })).toBeVisible();
  await page.goto("/dashboard/profile");
  await page.getByLabel("Name", { exact: true }).fill("Local Test Maker");
  await expect(page.getByLabel("Username")).toHaveValue(`tester-${run}`);
  await page.getByLabel("Username").fill(`local-test-maker-${run}`);
  await page.getByLabel("Headline").fill("Builds test fixtures for a living");
  await page.getByLabel("Location").fill("Gothenburg, Sweden");
  await page.getByLabel("About").fill("An isolated maker profile for browser verification.");
  await page.getByLabel("Skills").fill("Testing, Playwright, testing");
  await page.getByRole("button", { name: "Add experience" }).click();
  const role = page.getByRole("group", { name: "Role 1" });
  await role.getByLabel("Title").fill("Test engineer");
  await role.getByLabel("Company").fill("Harbor QA");
  await role.getByLabel("Start month").selectOption("03");
  await role.getByLabel("Start year").selectOption("2021");
  await role.getByLabel("I work here now").check();
  await page.getByLabel("Website", { exact: true }).fill("https://example.com");
  // Each link must point to its own site; everything typed so far stays in the form.
  await page.getByLabel("LinkedIn").fill("https://evil.example/in/local-test-maker");
  const save = page.getByRole("button", { name: "Save profile" });
  await save.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Use your LinkedIn address" }),
  ).toBeVisible();
  await expect(page.getByLabel("Headline")).toHaveValue("Builds test fixtures for a living");
  await expect(role.getByLabel("Title")).toHaveValue("Test engineer");
  await expect(role.getByLabel("Start month")).toHaveValue("03");
  await expect(role.getByLabel("I work here now")).toBeChecked();
  await page.getByLabel("LinkedIn").fill("https://www.linkedin.com/in/local-test-maker");
  await page.getByLabel("Upload photo").setInputFiles({
    name: "invalid.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await save.click();
  await expect(page.getByRole("alert").filter({ hasText: "Choose a valid PNG" })).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Local Test Maker");
  await page
    .getByLabel("Upload photo")
    .setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: png });
  await save.click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  // The maker's id leads to the address made from the new username; the old one is free again.
  // Profiles moved from /makers to /users, and the old addresses lead on.
  const oldAddress = await page.request.get(`/makers/${firstUserId}`, { maxRedirects: 0 });
  expect(oldAddress.status()).toBe(308);
  expect(oldAddress.headers().location).toBe(`/users/${firstUserId}`);
  await page.goto(`/users/${firstUserId}`);
  await expect(page).toHaveURL(new RegExp(`/users/local-test-maker-${run}$`));
  await expect(page.getByRole("heading", { name: "Local Test Maker", exact: true })).toBeVisible();
  await expect(page.getByText(`@local-test-maker-${run}`, { exact: true })).toBeVisible();
  const current = page.url();
  await page.goto(`/users/tester-${run}`);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  // After a change, the username is locked for 30 days; the form says so and the server refuses.
  await page.goto("/dashboard/profile");
  const locked = page.getByLabel("Username");
  await expect(locked).toHaveAttribute("readonly", "");
  await expect(page.getByText(/You can change your username again in 30 days\./)).toBeVisible();
  await locked.evaluate((input) => input.removeAttribute("readonly"));
  await locked.fill(`another-${run}`);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "You can change your username again in 30 days." }),
  ).toBeVisible();
  await page.goto(current);
  await expect(page).toHaveTitle("Local Test Maker | The SaaS Harbor");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    new URL(page.url()).href,
  );
  const image = page.getByRole("img", { name: "Local Test Maker" });
  await expect(image).toBeVisible();
  expect(
    await image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
  ).toBe(true);
  // The personal profile shows everything that was saved, and its owner can edit it from here.
  await expect(page.getByText("Builds test fixtures for a living")).toBeVisible();
  await expect(page.getByText("Gothenburg, Sweden").first()).toBeVisible();
  const experience = page.getByRole("region", { name: "Experience" });
  await expect(experience.getByText("Test engineer")).toBeVisible();
  await expect(experience.getByText(/^Mar 2021 - Present · /)).toBeVisible();
  await expect(page.getByRole("region", { name: "Skills" }).getByRole("listitem")).toHaveText([
    "Testing",
    "Playwright",
  ]);
  await expect(page.getByRole("link", { name: "local-test-maker" })).toHaveAttribute(
    "href",
    "https://www.linkedin.com/in/local-test-maker",
  );
  await expect(page.getByRole("link", { name: "Edit profile" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Send message" })).toHaveCount(0);
  await page.goto("/dashboard/saas/new");
  await fillProduct(page, productName);
  await page.getByLabel("Category").selectOption("Design");
  await page.getByLabel("Upload logo").setInputFiles({
    name: "invalid.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await page.getByRole("button", { name: "Add SaaS", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Choose a valid PNG" })).toBeVisible();
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(productName);
  await expect(page.getByLabel("Category")).toHaveValue("Design");
  await page
    .getByLabel("Upload logo")
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Add SaaS", exact: true }).click();
  // New products continue straight to Stripe verification.
  await expect(page).toHaveURL(/\/dashboard\/saas\/[0-9a-f-]{36}\?created=1/);
  productId = new URL(page.url()).pathname.split("/").at(-1)!;
  await expect(
    page.getByText("Product added. Connect your payment provider to verify its revenue."),
  ).toBeVisible();

  // Stripe's key form opens with the read permissions filled in.
  await expect(
    page.getByRole("link", { name: "Create a read-only key in Stripe" }),
  ).toHaveAttribute(
    "href",
    "https://dashboard.stripe.com/apikeys/create?name=The+SaaS+Harbor&permissions%5B%5D=rak_subscription_read&permissions%5B%5D=rak_invoice_read&permissions%5B%5D=rak_coupon_read&permissions%5B%5D=rak_plan_read",
  );

  // Revenue can only come from a read-only Stripe key, and the key is never echoed back.
  const stripeKey = page.getByLabel("Restricted key", { exact: true });
  const connect = page.getByRole("button", { name: "Connect and verify" });
  await stripeKey.fill(`sk_live_${"x".repeat(24)}`);
  await connect.click();
  await expect(page.getByRole("alert").filter({ hasText: "Use a restricted key" })).toBeVisible();
  await expect(stripeKey).toHaveValue("");
  await stripeKey.fill("rk_test_harbornoperm00001");
  await connect.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "missing a read permission" }),
  ).toBeVisible();
  await stripeKey.fill("rk_test_harborfixture0001");
  await connect.click();
  const revenue = page.locator("#revenue");
  await expect(revenue.getByText("Connected to Stripe")).toBeVisible();
  await expect(revenue.getByText("Test mode")).toBeVisible();
  await expect(revenue.getByText("$104", { exact: true })).toBeVisible();
  await expect(revenue.getByText("3", { exact: true })).toBeVisible();
  const { data: stored } = await admin
    .from("revenue_connections")
    .select("encrypted_key, key_hint")
    .eq("saas_id", productId)
    .single();
  expect(stored!.encrypted_key).toMatch(/^v1:/);
  expect(stored!.encrypted_key).not.toContain("harborfixture");
  expect(stored!.key_hint).toBe("rk_test_…0001");

  // Verified figures stay private until the maker shares them.
  await page.goto(`/saas/${productId}`);
  await expect(page.getByRole("heading", { name: productName, exact: true })).toBeVisible();
  await expect(page).toHaveTitle(`${productName} | The SaaS Harbor`);
  // The id leads to a readable address, which the canonical link, the sharing image and the
  // sitemap use.
  const origin = test.info().project.use.baseURL!;
  const productPath = `/saas/harbor-test-${run}`;
  await expect(page).toHaveURL(productPath);
  const moved = await page.request.get(`/saas/${productId}`, { maxRedirects: 0 });
  expect(moved.status()).toBe(308);
  expect(moved.headers().location).toMatch(new RegExp(`${productPath}$`));
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${origin}${productPath}`,
  );
  const card = page.locator('meta[property="og:image"]');
  await expect(card).toHaveAttribute("content", new RegExp(`${productPath}/opengraph-image`));
  const cardImage = await page.request.get((await card.getAttribute("content"))!);
  expect(cardImage.status()).toBe(200);
  expect(cardImage.headers()["content-type"]).toBe("image/png");
  expect(await (await page.request.get("/sitemap.xml")).text()).toContain(
    `<loc>${origin}${productPath}</loc>`,
  );
  // The embeddable badge shows only public figures and follows the product's address.
  const badge = async (path: string) => {
    const response = await page.request.get(path, { maxRedirects: 0 });
    return { status: response.status(), headers: response.headers(), body: await response.text() };
  };
  const privateBadge = await badge(`${productPath}/badge.svg`);
  expect(privateBadge.status).toBe(200);
  expect(privateBadge.headers["content-type"]).toBe("image/svg+xml; charset=utf-8");
  expect(privateBadge.headers["cache-control"]).toBe("public, max-age=600");
  expect(privateBadge.headers["content-security-policy"]).toBe("default-src 'none'");
  expect(privateBadge.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  expect(privateBadge.body).toContain(">Listed on</text>");
  expect(privateBadge.body).not.toContain("$104");
  const movedBadge = await badge(`/saas/${productId}/badge.svg?theme=dark`);
  expect(movedBadge.status).toBe(308);
  expect(movedBadge.headers.location).toBe(`${productPath}/badge.svg?theme=dark`);
  expect((await badge("/saas/no-such-product-anywhere/badge.svg")).status).toBe(404);
  // AI assistants read a Markdown version of the page, which shows no private figure either.
  const markdown = await page.request.get(`${productPath}.md`);
  expect(markdown.headers()["content-type"]).toBe("text/markdown; charset=utf-8");
  expect(markdown.headers()["x-robots-tag"]).toBe("noindex");
  const privateMarkdown = await markdown.text();
  expect(privateMarkdown).toContain(`# ${productName}`);
  expect(privateMarkdown).toContain("- Monthly recurring revenue: not shared");
  expect(privateMarkdown).not.toContain("$104");
  const movedMarkdown = await page.request.get(`/saas/${productId}.md`, { maxRedirects: 0 });
  expect(movedMarkdown.status()).toBe(308);
  expect(movedMarkdown.headers().location).toBe(`${productPath}.md`);
  await expect(page.locator('link[rel="alternate"][type="text/markdown"]')).toHaveAttribute(
    "href",
    `${origin}${productPath}.md`,
  );
  // Structured data describes the product for search engines.
  const structured = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent())!,
  );
  expect(structured.mainEntity).toMatchObject({
    "@type": "SoftwareApplication",
    name: productName,
    applicationSubCategory: "Design",
  });
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Design");
  await expect(page.getByText(/Verified with Stripe through a read-only key/)).toBeVisible();
  await expect(page.getByText("Not shared", { exact: true })).toHaveCount(3);
  // Visible text only: the page source also carries framework references like "$104".
  expect(await page.locator("main").innerText()).not.toContain("$104");
  const { data: publicData } = await anon
    .from("public_saas")
    .select("*")
    .eq("id", productId)
    .single();
  expect(publicData.mrr_cents).toBeNull();
  expect(publicData.revenue_status).toBe("private");
  for (const table of ["revenue_snapshots", "revenue_connections"]) {
    const { error: denied } = await anon.from(table).select("*");
    expect(denied?.code, table).toBe("42501");
  }
  await page.goto(`/dashboard/saas/${productId}`);
  await page.getByLabel("Show verified MRR publicly", { exact: true }).check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/saved=/);
  // Shared MRR reaches the badge, and the editor gives the code to embed it in either theme.
  expect((await badge(`${productPath}/badge.svg`)).body).toContain(">$104</text>");
  expect((await badge(`${productPath}/badge.svg?theme=dark`)).body).toContain('fill="#22272d"');
  // Shared MRR reaches the Markdown versions, llms.txt and the category page. The local database
  // may rank other products above this one, so the lists are checked where it fits on them.
  expect(await (await page.request.get(`${productPath}.md`)).text()).toContain(
    "- Monthly recurring revenue: $104",
  );
  const { data: maker } = await anon.from("profiles").select("slug").eq("id", firstUserId).single();
  expect(await (await page.request.get(`/users/${maker!.slug}.md`)).text()).toContain(
    `- [${productName}](${origin}${productPath}.md): A product created only by the local integration test. $104 verified MRR.`,
  );
  const { data: ranking } = await anon.from("leaderboard").select("id").order("rank");
  if (ranking!.findIndex((row) => row.id === productId) < 50)
    expect(await (await page.request.get("/llms.txt")).text()).toContain(
      `[${productName}](${origin}${productPath}.md): $104 verified MRR, Design.`,
    );
  const { data: design } = await anon
    .from("leaderboard")
    .select("id")
    .eq("category", "Design")
    .order("rank");
  if (design!.findIndex((row) => row.id === productId) < 12) {
    await page.goto("/categories/design");
    await expect(
      page.getByRole("region", { name: "Ranked by verified MRR" }).getByText(productName, {
        exact: true,
      }),
    ).toBeVisible();
  }
  await page.goto(`/dashboard/saas/${productId}`);
  const embed = page.locator("#badge");
  await expect(embed.getByLabel("HTML", { exact: true })).toHaveValue(
    `<a href="${origin}${productPath}"><img src="${origin}${productPath}/badge.svg" alt="${productName} on The SaaS Harbor" height="52"></a>`,
  );
  await embed.getByRole("button", { name: "Dark" }).click();
  await expect(embed.getByLabel("Markdown", { exact: true })).toHaveValue(
    `[![${productName} on The SaaS Harbor](${origin}${productPath}/badge.svg?theme=dark)](${origin}${productPath})`,
  );
  await expect(embed.getByRole("img", { name: /^Badge preview/ })).toHaveJSProperty(
    "naturalHeight",
    52,
  );
  await page.goto(`/?q=${encodeURIComponent(productName)}`);
  const row = page.getByRole("link").filter({ hasText: productName });
  await expect(row.getByText("$104", { exact: true })).toBeVisible();
  // Shared MRR brings its invoice history: a trend line and 30-day growth on the leaderboard,
  // and a month-end chart with a table view on the product page.
  await expect(row.getByText("+92.6%", { exact: true })).toBeVisible();
  await expect(row.locator("polyline")).toHaveCount(1);
  await page.goto(`/saas/${productId}`);
  await expect(page).toHaveTitle(`${productName}: $104 verified MRR | The SaaS Harbor`);
  // Verified revenue earns a link to the website that search engines follow, and the site sees
  // where its visitors came from.
  await expect(page.getByRole("link", { name: "Visit website" })).toHaveAttribute(
    "rel",
    "noopener",
  );
  await expect(page.getByText("+92.6%", { exact: true })).toBeVisible();
  const chart = page.getByRole("group", { name: /MRR at month end/ });
  await expect(chart).toBeVisible();
  await chart.focus();
  await page.keyboard.press("Home");
  await expect(chart.getByText(/^[A-Z][a-z]+ \d{4}: \$29$/)).toBeAttached();
  await page.getByText("Show as table").click();
  const months = page.getByRole("table", { name: "MRR at month end" }).locator("tbody tr");
  await expect(months).toHaveCount(12);
  await expect(months.first().getByRole("cell")).toHaveText("$29");
  await expect(months.last().getByRole("cell")).toHaveText("$54");
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  // Audit pages in both themes while they show real, shared data.
  const dataPages = [
    `/?q=${encodeURIComponent(productName)}`,
    `/saas/${productId}`,
    `/users/${firstUserId}`,
    "/discover",
    "/categories/design",
    "/dashboard",
    `/dashboard/saas/${productId}`,
    "/dashboard/profile",
  ];
  for (const theme of ["dark", "light"] as const) {
    await setThemeCookie(page, theme);
    for (const path of dataPages) {
      await page.goto(path);
      await expectAccessible(page);
    }
  }

  // Manual refresh is rate limited, then re-reads Stripe.
  await page.goto(`/dashboard/saas/${productId}`);
  await page.getByRole("button", { name: "Refresh now" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "checked in the last few minutes" }),
  ).toBeVisible();
  await admin
    .from("revenue_connections")
    .update({
      last_synced_at: new Date(Date.now() - 10 * 60_000).toISOString(),
      last_checked_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    })
    .eq("saas_id", productId);
  await page.reload();
  await page.getByRole("button", { name: "Refresh now" }).click();
  await expect(
    page.getByText(
      "Verified MRR: $104 from 3 paying customers. 1 usage-based item was not counted.",
    ),
  ).toBeVisible();

  await page.getByLabel("Show verified MRR publicly", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/saved=/);
  await page.goto(`/?q=${encodeURIComponent(productName)}`);
  await expect(page.getByText(productName, { exact: true })).toHaveCount(0);
  await page.goto(`/discover?q=${encodeURIComponent(productName)}`);
  await expect(page.getByRole("heading", { name: productName, exact: true })).toBeVisible();

  // One Stripe account can verify one product only.
  await page.goto("/dashboard/saas/new");
  await fillProduct(page, `Second ${run}`);
  await page.getByRole("button", { name: "Add SaaS", exact: true }).click();
  await expect(page).toHaveURL(/created=1/);
  const secondId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.getByLabel("Restricted key", { exact: true }).fill("rk_test_harborfixture0002");
  await page.getByRole("button", { name: "Connect and verify" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "already verifies another SaaS" }),
  ).toBeVisible();
  await page.goto("/dashboard");
  const products = page.getByRole("list", { name: "Your products" }).getByRole("listitem");
  await expect(products).toHaveCount(2);
  await expect(products.filter({ hasText: productName }).getByText("Verified")).toBeVisible();
  await expect(
    products.filter({ hasText: `Second ${run}` }).getByText("Not verified"),
  ).toBeVisible();

  // Disconnecting deletes the key and the public verification, and frees the subscriptions.
  await page.goto(`/dashboard/saas/${productId}`);
  await page.getByRole("button", { name: "Disconnect" }).click();
  await page.getByRole("button", { name: "Confirm disconnect" }).click();
  await expect(page.getByLabel("Restricted key", { exact: true })).toBeVisible();
  const { count: remaining } = await admin
    .from("revenue_connections")
    .select("saas_id", { count: "exact", head: true })
    .eq("saas_id", productId);
  expect(remaining).toBe(0);
  const { data: afterDisconnect } = await anon
    .from("public_saas")
    .select("revenue_status")
    .eq("id", productId)
    .single();
  expect(afterDisconnect?.revenue_status).toBe("unverified");
  // Without verified revenue, the link to the website is not followed.
  await page.goto(`/saas/harbor-test-${run}`);
  await expect(page.getByRole("link", { name: "Visit website" })).toHaveAttribute(
    "rel",
    "noopener nofollow",
  );
  await page.goto(`/dashboard/saas/${secondId}`);
  await page.getByLabel("Restricted key", { exact: true }).fill("rk_test_harborfixture0002");
  await page.getByRole("button", { name: "Connect and verify" }).click();
  await expect(page.locator("#revenue").getByText("Connected to Stripe")).toBeVisible();
  // This key cannot read invoices, so MRR is verified without history and the maker is told why.
  await expect(page.getByText(/No revenue history yet/)).toBeVisible();

  // The scheduled sync endpoint refuses callers without the secret.
  expect((await request.post("/api/revenue/sync")).status()).toBe(401);
  expect(
    (
      await request.post("/api/revenue/sync", { headers: { Authorization: "Bearer wrong" } })
    ).status(),
  ).toBe(401);
  // A renamed product gets a new address, and the old one keeps leading to it.
  await page.goto(`/dashboard/saas/${secondId}`);
  await page.getByLabel("Product name", { exact: true }).fill(`Renamed ${run}`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/saved=/);
  await page.goto(`/saas/second-${run}`);
  await expect(page).toHaveURL(`/saas/renamed-${run}`);
  // Verified revenue that stays private earns the followed link too.
  await expect(page.getByRole("link", { name: "Visit website" })).toHaveAttribute(
    "rel",
    "noopener",
  );
  await expect(page.getByRole("heading", { name: `Renamed ${run}`, exact: true })).toBeVisible();
  // The signed-in header carries extra links, so check it separately on a phone-sized screen.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/",
    "/dashboard",
    "/dashboard/profile",
    `/dashboard/saas/${productId}`,
    `/saas/${productId}`,
    `/users/${firstUserId}`,
  ]) {
    await page.goto(path);
    await expectNoHorizontalScroll(page);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth$/);
  await login(page, email, password);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Local Test Maker", exact: true })).toBeVisible();
});

test("another owner cannot read private history, edit SaaS, or overwrite images", async ({
  page,
}) => {
  const { data, error } = await admin.auth.admin.createUser({
    email: secondEmail,
    password: secondPassword,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error("Unable to create isolated second owner.");
  userIds.push(data.user.id);
  await login(page, secondEmail, secondPassword);
  await page.goto(`/dashboard/saas/${productId}`);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  const other = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await other.auth.signInWithPassword({ email: secondEmail, password: secondPassword });
  for (const table of ["revenue_snapshots", "revenue_connections"]) {
    const { data: rows, error: readError } = await other
      .from(table)
      .select("saas_id")
      .eq("saas_id", productId);
    expect(readError, table).toBeNull();
    expect(rows, table).toEqual([]);
  }
  const { data: updated } = await other
    .from("saas")
    .update({ name: "Hijacked" })
    .eq("id", productId)
    .select();
  expect(updated).toEqual([]);
  const { error: uploadError } = await other.storage
    .from("profile-images")
    .upload(`${firstUserId}/forged.png`, png, { contentType: "image/png" });
  expect(uploadError).not.toBeNull();
  const { data: original } = await anon
    .from("public_saas")
    .select("name,mrr_cents")
    .eq("id", productId)
    .single();
  expect(original?.name).toBe(productName);
  expect(original?.mrr_cents).toBeNull();
  await other.auth.signOut();
});

test("password recovery confirms a local email link and accepts the new password", async ({
  browser,
  page,
  request,
}) => {
  await page.goto("/auth?mode=reset");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByText("If an account exists, you will receive a password reset link."),
  ).toBeVisible();
  let resetId = "";
  await expect
    .poll(async () => {
      const mailbox = await (await request.get(`${mailpit}/api/v1/messages`)).json();
      const message = mailbox.messages.find(
        (item: { Subject: string; To: { Address: string }[] }) =>
          item.Subject.toLowerCase().includes("reset") &&
          item.To.some((to) => to.Address === email),
      );
      resetId = message?.ID ?? "";
      return !!resetId;
    })
    .toBe(true);
  const message = await (await request.get(`${mailpit}/api/v1/message/${resetId}`)).json();
  expect(message.Subject).toBe("Reset your password for The SaaS Harbor");
  // The link also works in another browser than the one that asked for it.
  const elsewhere = await (await browser.newContext()).newPage();
  await elsewhere.goto(confirmLink(message.HTML));
  await expect(elsewhere.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await elsewhere.getByRole("button", { name: "Choose a new password" }).click();
  await expect(elsewhere).toHaveURL(/mode=update/);
  const replacement = randomBytes(24).toString("hex");
  await elsewhere.getByLabel("New password").fill(replacement);
  await elsewhere.getByRole("button", { name: "Update password" }).click();
  await expect(elsewhere).toHaveURL(/\/dashboard$/);
  await elsewhere.context().close();
  await login(page, email, replacement);
  // A session from a password sign-in cannot set a new password; that takes a fresh reset link.
  await page.goto("/auth?mode=update");
  await page.getByLabel("New password").fill(randomBytes(24).toString("hex"));
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "This reset link has expired" }),
  ).toBeVisible();
});

test("a user deletes products, then their account and everything in it", async ({ page }) => {
  const { data: created, error } = await admin.auth.admin.createUser({
    email: leavingEmail,
    password: leavingPassword,
    email_confirm: true,
  });
  if (error || !created.user) throw new Error("Unable to create the leaving maker.");
  const id = created.user.id;
  userIds.push(id);

  // A profile with a photo, an image in a subfolder, and three products: one with its own logo
  // and a verified Stripe connection, one whose logo is the profile photo, and one that stays
  // until the account goes.
  const maker = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await maker.auth.signInWithPassword({ email: leavingEmail, password: leavingPassword });
  const images = maker.storage.from("profile-images");
  for (const file of ["avatar.png", "logo.png", "nested/old.png"]) {
    const { error: uploadError } = await images.upload(`${id}/${file}`, png, {
      contentType: "image/png",
    });
    if (uploadError) throw new Error("Unable to upload fixture images.");
  }
  const { error: profileError } = await maker.from("profiles").insert({
    id,
    name: "Leaving Maker",
    bio: "",
    website: "",
    social_url: "",
    avatar_path: `${id}/avatar.png`,
  });
  if (profileError) throw new Error("Unable to create the fixture profile.");
  async function product(name: string, logo: string | null, verified: boolean) {
    const productId = randomUUID();
    const { error: saveError } = await maker.rpc("save_saas", {
      p_id: productId,
      p_name: name,
      p_tagline: "A product created only by the local deletion test.",
      p_description: "This is an isolated local integration fixture for deleting data.",
      p_category: "Other",
      p_website: "https://example.com",
      p_logo_path: logo && `${id}/${logo}`,
      p_launched_on: null,
      p_share_mrr: true,
      p_share_customers: false,
      p_share_launch: false,
    });
    if (saveError) throw new Error("Unable to create a fixture product.");
    if (!verified) return productId;
    const { error: verifyError } = await admin.rpc("record_revenue_verification", {
      p_saas_id: productId,
      p_provider: "stripe",
      p_encrypted_key: "v1:e2e-fixture",
      p_key_hint: "rk_test_…e2e0",
      p_livemode: false,
      p_mrr_cents: 4200,
      p_customers: 2,
      p_currencies: { usd: 4200 },
      p_fx_date: null,
      p_subscription_hashes: [createHash("sha256").update(`${name}-${run}`).digest("hex")],
      p_history: null,
      p_mrr_invoice_cents: null,
      p_mrr_30d_ago_cents: null,
    });
    if (verifyError) throw new Error("Unable to verify a fixture product.");
    return productId;
  }
  const ownLogo = await product(`Own logo ${run}`, "logo.png", true);
  const sharedLogo = await product(`Shared logo ${run}`, "avatar.png", false);
  const staying = await product(`Staying ${run}`, null, true);
  await maker.auth.signOut();
  const files = async (folder: string) =>
    ((await admin.storage.from("profile-images").list(folder)).data ?? []).map((f) => f.name);

  await login(page, leavingEmail, leavingPassword);
  const productList = page.getByRole("list", { name: "Your products" }).getByRole("listitem");

  // A product is deleted only when its name is typed exactly.
  await page.goto(`/dashboard/saas/${ownLogo}`);
  const confirmName = page.getByLabel(`Type “Own logo ${run}” to confirm`);
  const deleteProduct = page.getByRole("button", { name: "Delete product" });
  await confirmName.fill("Own logo");
  await deleteProduct.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Type the product name exactly as shown" }),
  ).toBeVisible();
  expect((await admin.from("saas").select("id").eq("id", ownLogo)).data).toHaveLength(1);
  await confirmName.fill(`Own logo ${run}`);
  await deleteProduct.click();
  await expect(page).toHaveURL(/\/dashboard\?deleted=1$/);
  await expect(page.getByText("Product deleted.")).toBeVisible();
  await expect(productList).toHaveCount(2);
  expect((await admin.from("saas").select("id").eq("id", ownLogo)).data).toEqual([]);
  for (const table of [
    "saas_settings",
    "public_metrics",
    "revenue_snapshots",
    "revenue_connections",
  ]) {
    const { data: rows, error: readError } = await admin
      .from(table)
      .select("saas_id")
      .eq("saas_id", ownLogo);
    expect(readError, table).toBeNull();
    expect(rows, table).toEqual([]);
  }
  expect(await files(id)).toEqual(expect.arrayContaining(["avatar.png", "nested"]));
  expect(await files(id)).not.toContain("logo.png");
  await page.goto(`/saas/${ownLogo}`);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();

  // A logo that is also the profile photo stays in place.
  await page.goto(`/dashboard/saas/${sharedLogo}`);
  await page.getByLabel(`Type “Shared logo ${run}” to confirm`).fill(`Shared logo ${run}`);
  await page.getByRole("button", { name: "Delete product" }).click();
  await expect(page).toHaveURL(/\/dashboard\?deleted=1$/);
  await expect(productList).toHaveCount(1);
  expect(await files(id)).toContain("avatar.png");

  await page.goto("/dashboard/profile");
  const confirm = page.getByLabel("Confirm with your password");
  const remove = page.getByRole("button", { name: "Delete account" });
  // A wrong password changes nothing, and the password is never written back into the field.
  await confirm.fill("not-the-right-password");
  await remove.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "The password is incorrect." }),
  ).toBeVisible();
  await expect(confirm).toHaveValue("");
  expect((await admin.auth.admin.getUserById(id)).error).toBeNull();
  expect(await files(id)).toHaveLength(2);

  await confirm.fill(leavingPassword);
  await remove.click();
  await expect(page).toHaveURL(/\/account-deleted$/);
  await expect(page.getByRole("heading", { name: "Your account has been deleted" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();

  expect((await admin.auth.admin.getUserById(id)).error?.status).toBe(404);
  for (const [table, column] of [
    ["profiles", "id"],
    ["saas", "owner_id"],
    ["saas_settings", "owner_id"],
    ["public_metrics", "owner_id"],
    ["revenue_snapshots", "owner_id"],
    ["revenue_connections", "owner_id"],
  ]) {
    const { data: rows, error: readError } = await admin.from(table).select(column).eq(column, id);
    expect(readError, table).toBeNull();
    expect(rows, table).toEqual([]);
  }
  for (const folder of [id, `${id}/nested`]) expect(await files(folder), folder).toEqual([]);
  await page.goto(`/saas/${staying}`);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth$/);
  await page.getByLabel("Email address").fill(leavingEmail);
  await page.getByLabel("Password", { exact: true }).fill(leavingPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Unable to sign in" })).toBeVisible();
});

test("users message each other live, with unread counts and blocking", async ({ browser }) => {
  const baseURL = test.info().project.use.baseURL;
  const makers: { id: string; email: string; password: string; name: string }[] = [];
  for (const label of ["writer", "reader"]) {
    const address = `harbor-${label}-${run}@example.test`;
    const secret = randomBytes(24).toString("hex");
    const { data, error } = await admin.auth.admin.createUser({
      email: address,
      password: secret,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error("Unable to create a messaging maker.");
    userIds.push(data.user.id);
    const name = `Maker ${label} ${run}`;
    const { error: profileError } = await admin.from("profiles").insert({ id: data.user.id, name });
    if (profileError) throw new Error("Unable to create a messaging profile.");
    makers.push({ id: data.user.id, email: address, password: secret, name });
  }
  const [writer, reader] = makers;
  const hydrationErrors: string[] = [];
  const violations: string[] = [];
  const open = async () => {
    const page = await (await browser.newContext({ baseURL })).newPage();
    page.on("console", (message) => {
      if (message.type() === "error" && /hydrat/i.test(message.text()))
        hydrationErrors.push(message.text());
    });
    // Live messages use the Realtime websocket, which the policy must allow.
    watchPolicy(page, violations);
    return page;
  };

  // The reader waits on the dashboard; the unread count must arrive without a reload.
  const readerPage = await open();
  await login(readerPage, reader.email, reader.password);

  // A visitor who chooses Send message signs in and continues in the conversation.
  const writerPage = await open();
  await writerPage.goto(`/users/${reader.id}`);
  await writerPage.getByRole("link", { name: "Send message" }).click();
  await expect(writerPage).toHaveURL(`/auth?next=${encodeURIComponent(`/messages/${reader.id}`)}`);
  await writerPage.getByLabel("Email address").fill(writer.email);
  await writerPage.getByLabel("Password", { exact: true }).fill(writer.password);
  await writerPage.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(writerPage).toHaveURL(`/messages/${reader.id}`);
  await expect(writerPage.getByRole("heading", { name: reader.name })).toBeVisible();

  const writerLog = writerPage.getByRole("log");
  const writerField = writerPage.getByLabel(`Message to ${reader.name}`);
  const writerSend = writerPage.getByRole("button", { name: "Send", exact: true });
  await writerField.fill("Hello! Are you open to partners?");
  await writerSend.click();
  await expect(writerLog.getByText("Hello! Are you open to partners?")).toBeVisible();
  await expect(writerField).toHaveValue("");

  const unread = readerPage.getByRole("link", { name: "Messages, 1 unread" });
  await expect(unread).toBeVisible();
  await unread.click();
  await expect(readerPage).toHaveURL("/messages");
  const row = readerPage
    .getByRole("list", { name: "Conversations" })
    .getByRole("link")
    .filter({ hasText: writer.name });
  await expect(row.getByText("1 unread")).toBeAttached();
  await row.click();
  await expect(
    readerPage.getByRole("log").getByText("Hello! Are you open to partners?"),
  ).toBeVisible();
  await expect(
    readerPage.getByRole("banner").getByRole("link", { name: "Messages", exact: true }),
  ).toBeVisible();

  // Replies arrive in the open conversation without a reload, and are read there at once.
  await readerPage.getByLabel(`Message to ${writer.name}`).fill("Yes, happy to talk.");
  await readerPage.getByRole("button", { name: "Send", exact: true }).click();
  await expect(writerLog.getByText("Yes, happy to talk.")).toBeVisible();
  await expect(
    writerPage.getByRole("banner").getByRole("link", { name: "Messages", exact: true }),
  ).toBeVisible();

  // A block stops messages in both directions until it is lifted. A refused message stays.
  await readerPage.getByRole("button", { name: `Block ${writer.name}` }).click();
  await expect(readerPage.getByText(`You blocked ${writer.name}.`)).toBeVisible();
  await writerField.fill("Are you there?");
  await writerSend.click();
  await expect(
    writerPage
      .getByRole("alert")
      .filter({ hasText: "Messages between you and this user are blocked." }),
  ).toBeVisible();
  await expect(writerField).toHaveValue("Are you there?");
  await readerPage.getByRole("button", { name: `Unblock ${writer.name}` }).click();
  await expect(readerPage.getByLabel(`Message to ${writer.name}`)).toBeVisible();
  await writerSend.click();
  await expect(readerPage.getByRole("log").getByText("Are you there?")).toBeVisible();

  // Makers cannot message themselves.
  await writerPage.goto(`/users/${writer.id}`);
  await expect(writerPage.getByRole("heading", { name: writer.name })).toBeVisible();
  await expect(writerPage.getByRole("link", { name: "Send message" })).toHaveCount(0);
  await writerPage.goto(`/messages/${writer.id}`);
  await expect(writerPage).toHaveURL("/messages");

  for (const theme of ["dark", "light"] as const) {
    await setThemeCookie(readerPage, theme);
    for (const path of ["/messages", `/messages/${writer.id}`]) {
      await readerPage.goto(path);
      await expect(readerPage.getByRole("heading", { level: 1 })).toBeVisible();
      await expectAccessible(readerPage);
    }
  }
  await readerPage.setViewportSize({ width: 360, height: 800 });
  for (const path of ["/messages", `/messages/${writer.id}`, "/dashboard"]) {
    await readerPage.goto(path);
    await expectNoHorizontalScroll(readerPage);
  }
  expect(hydrationErrors).toEqual([]);
  expect(violations).toEqual([]);
});

test("reports reach the admin panel, where admins hide products and suspend accounts", async ({
  browser,
  request,
}) => {
  test.setTimeout(240000);
  const baseURL = test.info().project.use.baseURL;
  const people = {} as Record<
    "maker" | "reporter" | "moderator",
    { id: string; email: string; password: string; name: string }
  >;
  for (const role of ["maker", "reporter", "moderator"] as const) {
    const address = `harbor-${role}-${run}@example.test`;
    const secret = randomBytes(24).toString("hex");
    const { data, error } = await admin.auth.admin.createUser({
      email: address,
      password: secret,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error("Unable to create a moderation fixture.");
    userIds.push(data.user.id);
    const name = `Moderation ${role} ${run}`;
    const { error: profileError } = await admin.from("profiles").insert({ id: data.user.id, name });
    if (profileError) throw new Error("Unable to create a moderation profile.");
    people[role] = { id: data.user.id, email: address, password: secret, name };
  }
  const { maker, reporter, moderator } = people;
  const { error: grantError } = await admin.rpc("set_admin", {
    p_email: moderator.email,
    p_admin: true,
  });
  if (grantError) throw new Error("Unable to grant admin rights.");

  // The maker lists a product and writes to the reporter, through the app's own functions.
  const makerClient = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await makerClient.auth.signInWithPassword({ email: maker.email, password: maker.password });
  const productId = randomUUID();
  const product = `Reported product ${run}`;
  const { error: saveError } = await makerClient.rpc("save_saas", {
    p_id: productId,
    p_name: product,
    p_tagline: "A product created only by the local moderation test.",
    p_description: "This is an isolated local integration fixture for moderation.",
    p_category: "Other",
    p_website: "https://example.com",
    p_logo_path: null,
    p_launched_on: null,
    p_share_mrr: false,
    p_share_customers: false,
    p_share_launch: false,
  });
  if (saveError) throw new Error("Unable to create the reported product.");
  const offer = `Buy my course today ${run}`;
  const { error: sendError } = await makerClient.rpc("send_message", {
    p_recipient: reporter.id,
    p_body: offer,
  });
  if (sendError) throw new Error("Unable to send the reported message.");
  await makerClient.auth.signOut();
  const violations: string[] = [];
  const open = async () => {
    const page = await (await browser.newContext({ baseURL })).newPage();
    watchPolicy(page, violations);
    return page;
  };
  const [reporterPage, adminPage, makerPage, visitor] = await Promise.all([
    open(),
    open(),
    open(),
    open(),
  ]);

  // A visitor who chooses Report signs in first and continues to the report.
  await reporterPage.goto(`/saas/${productId}`);
  await reporterPage.getByRole("link", { name: "Report this product" }).click();
  await expect(reporterPage).toHaveURL(
    `/auth?next=${encodeURIComponent(`/report/saas/${productId}`)}`,
  );
  await reporterPage.getByLabel("Email address").fill(reporter.email);
  await reporterPage.getByLabel("Password", { exact: true }).fill(reporter.password);
  await reporterPage.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(reporterPage).toHaveURL(`/report/saas/${productId}`);
  await expect(reporterPage.getByRole("heading", { name: `Report ${product}` })).toBeVisible();
  // Illegal content needs an explanation, and the choice stays after the error.
  const illegal = reporterPage.getByRole("radio", { name: /^Illegal content/ });
  await illegal.check();
  const send = reporterPage.getByRole("button", { name: "Send report" });
  await send.click();
  await expect(
    reporterPage.getByRole("alert").filter({ hasText: "Describe the problem" }),
  ).toBeVisible();
  await expect(illegal).toBeChecked();
  await reporterPage.getByRole("radio", { name: /^Misleading or false information/ }).check();
  await reporterPage.getByLabel("Details").fill("The listing claims customers it does not have.");
  await send.click();
  await expect(reporterPage).toHaveURL("/dashboard/reports?sent=1");
  await expect(reporterPage.getByText("Thanks. Your report was sent")).toBeVisible();
  const sent = reporterPage.getByRole("list", { name: "Reports you sent" }).getByRole("listitem");
  await expect(sent.filter({ hasText: product }).getByText("Waiting for review")).toBeVisible();

  // A message is reported from the conversation.
  await reporterPage.goto(`/messages/${maker.id}`);
  const received = reporterPage.getByRole("log").getByRole("listitem").filter({ hasText: offer });
  await received.hover();
  await received.getByRole("link", { name: "Report this message" }).click();
  await expect(reporterPage).toHaveURL(/\/report\/message\/[0-9a-f-]{36}$/);
  await expect(reporterPage.getByText(offer)).toBeVisible();
  await reporterPage.getByRole("radio", { name: /^Spam or advertising/ }).check();
  await reporterPage.getByRole("button", { name: "Send report" }).click();
  await expect(reporterPage).toHaveURL("/dashboard/reports?sent=1");
  await expect(sent).toHaveCount(2);

  // The admins get an email about waiting reports.
  await expect
    .poll(async () =>
      (await inbox(request, moderator.email)).some((m) =>
        /^\d+ open reports? on The SaaS Harbor$/.test(m.Subject),
      ),
    )
    .toBe(true);

  // Everyone but an admin gets a 404 from the admin panel.
  await reporterPage.goto("/admin");
  await expect(reporterPage.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await visitor.goto("/admin/reports");
  await expect(visitor.getByRole("heading", { name: "Page not found" })).toBeVisible();

  // The admin opens the product report from the queue and hides the product.
  await login(adminPage, moderator.email, moderator.password);
  await adminPage.getByRole("link", { name: "Open admin panel" }).click();
  await expect(adminPage).toHaveURL("/admin");
  await adminPage
    .getByRole("navigation", { name: "Admin" })
    .getByRole("link", { name: "Reports" })
    .click();
  await adminPage.getByRole("link").filter({ hasText: product }).click();
  await expect(adminPage.getByRole("heading", { name: `Report about ${product}` })).toBeVisible();
  const reportPage = new URL(adminPage.url()).pathname;
  await expect(adminPage.getByText("The listing claims customers it does not have.")).toBeVisible();
  await expect(adminPage.getByText(reporter.email)).toBeVisible();
  const hide = adminPage.getByRole("region", { name: "Hide the product" });
  await expect(hide.getByLabel("Reason")).toHaveValue("misleading");
  await hide
    .getByLabel("Explanation for the user")
    .fill("The customer numbers in the description are not true.");
  await hide.getByRole("button", { name: "Hide product" }).click();
  await expect(adminPage.getByText("Product hidden. The founder sees")).toBeVisible();
  await expect(adminPage.getByRole("region", { name: "Outcome" })).toBeVisible();

  // The product is gone for everyone else, including through the API.
  expect((await anon.from("public_saas").select("id").eq("id", productId)).data).toEqual([]);
  expect((await anon.from("saas").select("id").eq("id", productId)).data).toEqual([]);
  const productSlug = `reported-product-${run}`;
  for (const path of [`/saas/${productId}`, `/saas/${productSlug}`]) {
    await visitor.goto(path);
    await expect(visitor.getByRole("heading", { name: "Page not found" })).toBeVisible();
  }
  expect(await (await visitor.request.get("/sitemap.xml")).text()).not.toContain(productSlug);
  expect((await visitor.request.get(`/saas/${productSlug}/badge.svg`)).status()).toBe(404);
  expect((await visitor.request.get(`/saas/${productSlug}.md`)).status()).toBe(404);
  // The maker gets the decision by email, with the reason and the explanation, and the reporter
  // learns that action was taken.
  const subjects = async (address: string) =>
    (await inbox(request, address)).map((message) => message.Subject);
  await expect.poll(() => subjects(maker.email)).toContain(`An admin hid your product ${product}`);
  const decision = (await inbox(request, maker.email)).find((message) =>
    message.Subject.startsWith("An admin hid"),
  )!;
  const decisionEmail = await emailText(request, decision.ID);
  expect(decisionEmail.Text).toContain("Reason: Misleading or false information");
  expect(decisionEmail.Text).toContain("The customer numbers in the description are not true.");
  await expect.poll(() => subjects(reporter.email)).toContain("Your report has been reviewed");

  // The maker sees the product as hidden, with the reason and the explanation.
  await login(makerPage, maker.email, maker.password);
  const ownProduct = makerPage
    .getByRole("list", { name: "Your products" })
    .getByRole("listitem")
    .filter({ hasText: product });
  await expect(ownProduct.getByText("Hidden", { exact: true })).toBeVisible();
  await ownProduct.getByRole("link", { name: "Edit" }).click();
  const hiddenNotice = makerPage.getByRole("region", { name: /Product hidden/ });
  await expect(hiddenNotice.getByText("Misleading or false information")).toBeVisible();
  await expect(
    hiddenNotice.getByText("The customer numbers in the description are not true."),
  ).toBeVisible();
  // The reporter sees the outcome, never the maker.
  await reporterPage.goto("/dashboard/reports");
  await expect(sent.filter({ hasText: product }).getByText("Action taken")).toBeVisible();

  // The admin finds the maker by email and suspends the account.
  await adminPage.goto(`/admin/accounts?q=${encodeURIComponent(maker.email)}`);
  await adminPage.getByRole("link").filter({ hasText: maker.email }).click();
  await expect(adminPage.getByRole("heading", { name: maker.name, level: 1 })).toBeVisible();
  const suspend = adminPage.getByRole("region", { name: "Suspend the account" });
  await suspend.getByLabel("Reason").selectOption("spam");
  await suspend
    .getByLabel("Explanation for the user")
    .fill("Sent the same advertisement to many makers.");
  await suspend.getByRole("button", { name: "Suspend account" }).click();
  await expect(adminPage.getByText("Account suspended. The user sees")).toBeVisible();
  await expect
    .poll(() => subjects(maker.email))
    .toContain("Your account on The SaaS Harbor is suspended");

  // The profile disappears, the conversation leaves the reporter's inbox, and the maker is told
  // why and can no longer send messages.
  await visitor.goto(`/users/${maker.id}`);
  await expect(visitor.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await reporterPage.goto("/messages");
  await expect(reporterPage.getByRole("heading", { name: "Messages", level: 1 })).toBeVisible();
  await expect(reporterPage.getByText(maker.name)).toHaveCount(0);
  await makerPage.goto("/dashboard");
  await expect(
    makerPage
      .getByRole("region", { name: /Account suspended/ })
      .getByText("Sent the same advertisement to many makers."),
  ).toBeVisible();
  await makerPage.goto(`/messages/${reporter.id}`);
  await expect(
    makerPage.getByText("Your account is suspended, so you cannot send messages."),
  ).toBeVisible();
  // Audit the maker's view of both decisions in both themes.
  for (const theme of ["dark", "light"] as const) {
    await setThemeCookie(makerPage, theme);
    for (const path of ["/dashboard", `/dashboard/saas/${productId}`, "/dashboard/profile"]) {
      await makerPage.goto(path);
      await expectAccessible(makerPage);
    }
  }

  // Lifting the suspension and showing the product bring everything back.
  await adminPage.goto(`/admin/accounts/${maker.id}`);
  await adminPage.getByRole("button", { name: "Lift suspension" }).click();
  await expect(adminPage.getByText("The suspension is lifted.")).toBeVisible();
  await adminPage.goto(`/admin/products/${productId}`);
  await adminPage.getByRole("button", { name: "Show product again" }).click();
  await expect(adminPage.getByText("The product is shown again.")).toBeVisible();
  await expect
    .poll(() => subjects(maker.email))
    .toContain(`Your product ${product} is shown again`);
  await visitor.goto(`/saas/${productId}`);
  await expect(visitor).toHaveURL(`/saas/${productSlug}`);
  await expect(visitor.getByRole("heading", { name: product, exact: true })).toBeVisible();
  await visitor.goto(`/users/${maker.id}`);
  await expect(visitor.getByRole("heading", { name: maker.name, exact: true })).toBeVisible();
  expect(await (await visitor.request.get("/sitemap.xml")).text()).toContain(productSlug);

  // Every decision is in the log.
  await adminPage.goto("/admin/log");
  const decisions = adminPage.getByRole("list", { name: "Decisions" }).getByRole("listitem");
  await expect(decisions.filter({ hasText: product })).toHaveText([
    /^Showed product again:/,
    /^Hid product:/,
  ]);
  await expect(decisions.filter({ hasText: maker.name })).toHaveText([
    /^Lifted suspension:/,
    /^Suspended account:/,
  ]);

  // Axe on every admin page and the report pages, in both themes, and no sideways scrolling on a
  // phone.
  const adminPages = [
    "/admin",
    "/admin/reports",
    "/admin/reports?status=closed",
    reportPage,
    "/admin/products",
    `/admin/products/${productId}`,
    "/admin/accounts",
    `/admin/accounts/${maker.id}`,
    "/admin/log",
  ];
  const reporterPages = [`/report/profile/${maker.id}`, "/dashboard/reports"];
  for (const theme of ["dark", "light"] as const) {
    await setThemeCookie(adminPage, theme);
    for (const path of adminPages) {
      await adminPage.goto(path);
      await expect(adminPage.getByRole("heading", { level: 1 })).toBeVisible();
      await expectAccessible(adminPage);
    }
    await setThemeCookie(reporterPage, theme);
    for (const path of reporterPages) {
      await reporterPage.goto(path);
      await expectAccessible(reporterPage);
    }
  }
  await adminPage.setViewportSize({ width: 390, height: 844 });
  for (const path of adminPages) {
    await adminPage.goto(path);
    await expectNoHorizontalScroll(adminPage);
  }
  await reporterPage.setViewportSize({ width: 390, height: 844 });
  for (const path of [...reporterPages, `/messages/${maker.id}`]) {
    await reporterPage.goto(path);
    await expectNoHorizontalScroll(reporterPage);
  }
  expect(violations).toEqual([]);
});

test("users send feedback from any page, and admins read it and mark it handled", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const people = {} as Record<"sender" | "reader", { id: string; email: string; password: string }>;
  for (const role of ["sender", "reader"] as const) {
    const address = `harbor-feedback-${role}-${run}@example.test`;
    const secret = randomBytes(24).toString("hex");
    const { data, error } = await admin.auth.admin.createUser({
      email: address,
      password: secret,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error("Unable to create a feedback fixture.");
    userIds.push(data.user.id);
    const { error: profileError } = await admin
      .from("profiles")
      .insert({ id: data.user.id, name: `Feedback ${role} ${run}` });
    if (profileError) throw new Error("Unable to create a feedback profile.");
    people[role] = { id: data.user.id, email: address, password: secret };
  }
  const { sender, reader } = people;
  const { error: grantError } = await admin.rpc("set_admin", {
    p_email: reader.email,
    p_admin: true,
  });
  if (grantError) throw new Error("Unable to grant admin rights.");

  // A visitor who opens the form signs in first, and comes back to it with the page remembered.
  const page = await (await browser.newContext()).newPage();
  await page.goto("/stats");
  await page.getByRole("link", { name: "Feedback", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\?next=%2Ffeedback%3Ffrom%3D%252Fstats$/);
  await page.getByLabel("Email address").fill(sender.email);
  await page.getByLabel("Password", { exact: true }).fill(sender.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/feedback\?from=%2Fstats$/);
  await expectAccessible(page);

  // The kind is required, and so is some text.
  const message = `The statistics page shows no chart on my phone ${run}.`;
  await page.getByLabel("Bug or error").check();
  await page.getByLabel("Your feedback").fill(message);
  await page.getByRole("button", { name: "Send feedback" }).click();
  const thanks = page.getByRole("heading", { name: "Thank you for your feedback" });
  await expect(thanks).toBeFocused();
  await expect(page.getByRole("link", { name: "Back to where you were" })).toHaveAttribute(
    "href",
    "/stats",
  );
  // Users cannot read feedback back, and the feedback admin page is a 404 for them.
  await page.goto("/admin/feedback");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.context().close();

  // The admin sees it on the overview and in the feedback list, with who sent it and from where.
  const adminPage = await (await browser.newContext()).newPage();
  await login(adminPage, reader.email, reader.password);
  await adminPage.goto("/admin");
  const overview = adminPage.getByRole("list", { name: "New feedback" });
  await expect(overview.getByText(message)).toBeVisible();
  await adminPage
    .getByRole("navigation", { name: "Admin" })
    .getByRole("link", { name: "Feedback" })
    .click();
  await expect(adminPage).toHaveURL("/admin/feedback");
  await expectAccessible(adminPage);
  const item = adminPage.getByRole("article").filter({ hasText: message });
  await expect(item.getByText("Bug or error")).toBeVisible();
  await expect(item.getByRole("link", { name: `Feedback sender ${run}` })).toHaveAttribute(
    "href",
    `/admin/accounts/${sender.id}`,
  );
  await expect(item.getByRole("link", { name: "/stats" })).toHaveAttribute("href", "/stats");

  // Marking it handled moves it from New to Handled, and it can be marked new again.
  await item.getByRole("button", { name: "Mark as handled" }).click();
  await expect(adminPage.getByText(message)).toHaveCount(0);
  await adminPage.getByRole("link", { name: "Handled" }).click();
  const handled = adminPage.getByRole("article").filter({ hasText: message });
  await expect(handled.getByText("Handled", { exact: true })).toBeVisible();
  await handled.getByRole("button", { name: "Mark as new" }).click();
  await expect(adminPage.getByText(message)).toHaveCount(0);
  await adminPage.goto("/admin/feedback");
  await expect(adminPage.getByText(message)).toBeVisible();
  await adminPage.context().close();
});

test("visits are counted without cookies, and admins see them under Analytics", async ({
  browser,
  request,
}) => {
  test.setTimeout(240000);
  const baseURL = test.info().project.use.baseURL!;
  const address = `harbor-analytics-${run}@example.test`;
  const secret = randomBytes(24).toString("hex");
  const { data, error } = await admin.auth.admin.createUser({
    email: address,
    password: secret,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error("Unable to create an analytics fixture.");
  userIds.push(data.user.id);
  const { error: grantError } = await admin.rpc("set_admin", { p_email: address, p_admin: true });
  if (grantError) throw new Error("Unable to grant admin rights.");

  // Headless browsers count as automated, so these visitors present ordinary browsers. The run
  // makes them new visitors, so a run soon after another still starts new visits.
  const chrome = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Run/${run}`;
  const firefox = `Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0 Run/${run}`;
  const violations: string[] = [];
  const visit = async (agent: string) => {
    const context = await browser.newContext({ baseURL, userAgent: agent });
    // Automated browsers are not counted, so these present themselves as ordinary ones.
    await context.addInitScript(() =>
      Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }),
    );
    const page = await context.newPage();
    watchPolicy(page, violations);
    const beacon = (type: string) =>
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/analytics" &&
          response.request().postDataJSON()?.type === type,
      );
    return { context, page, beacon };
  };

  // A visit from a campaign link: the page view gets an id, the time on the page is reported when
  // the visitor moves on through the site's own navigation, and a link to another site is counted.
  const first = await visit(chrome);
  let sent = first.beacon("pageview");
  await first.page.goto(`/about?utm_source=e2e-${run}&utm_campaign=launch-${run}&token=secret`);
  const view = await sent;
  expect(view.status()).toBe(200);
  const viewId = (await view.json()).id;
  expect(typeof viewId).toBe("number");
  await first.page.waitForTimeout(1500);
  const time = first.beacon("engagement");
  sent = first.beacon("pageview");
  await first.page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
  await expect(first.page).toHaveURL("/privacy");
  expect((await time).status()).toBe(204);
  expect((await sent).status()).toBe(200);
  const click = first.beacon("outbound");
  await first.page.evaluate((target) => {
    const link = document.createElement("a");
    link.href = target;
    link.textContent = "Elsewhere";
    // Counted on the way out; the test stays on the site.
    link.addEventListener("click", (event) => event.preventDefault());
    document.body.append(link);
    link.click();
  }, `https://example-${run}.test/pricing?ref=harbor`);
  expect((await click).status()).toBe(204);
  expect(await first.context.cookies()).toEqual([]);
  await first.context.close();

  // A visit linked from another site.
  const second = await visit(firefox);
  sent = second.beacon("pageview");
  await second.page.goto("/stats", { referer: `https://www.news-${run}.example/thread` });
  expect((await sent).status()).toBe(200);
  await second.context.close();

  // A view of a product's page counts for the product. Only its founder sees the count, on the
  // page, and their own views do not add to it.
  const founderEmail = `harbor-views-${run}@example.test`;
  const founderSecret = randomBytes(24).toString("hex");
  const { data: founderUser, error: founderError } = await admin.auth.admin.createUser({
    email: founderEmail,
    password: founderSecret,
    email_confirm: true,
  });
  if (founderError || !founderUser.user) throw new Error("Unable to create a founder fixture.");
  userIds.push(founderUser.user.id);
  const founderClient = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await founderClient.auth.signInWithPassword({ email: founderEmail, password: founderSecret });
  const { error: saveError } = await founderClient.rpc("save_saas", {
    p_id: randomUUID(),
    p_name: `Viewed ${run}`,
    p_tagline: "A product created only by the local statistics test.",
    p_description: "This is an isolated local integration fixture for page views.",
    p_category: "Other",
    p_website: "https://example.com",
    p_logo_path: null,
    p_launched_on: null,
    p_share_mrr: false,
    p_share_customers: false,
    p_share_launch: false,
  });
  if (saveError) throw new Error("Unable to create the viewed product.");
  await founderClient.auth.signOut();
  const viewedPath = `/saas/viewed-${run}`;
  const viewCounts = (page: Page) => page.getByRole("region", { name: "Page views" });
  // The product page's own page view, not one from a page before it that is still on its way.
  const viewed = (page: Page) =>
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/analytics" &&
        response.request().postDataJSON()?.path === viewedPath,
    );
  const third = await visit(chrome);
  sent = viewed(third.page);
  await third.page.goto(viewedPath);
  expect((await sent).status()).toBe(200);
  await expect(viewCounts(third.page)).toHaveCount(0);
  await third.context.close();
  const founder = await visit(`${firefox} Founder`);
  await login(founder.page, founderEmail, founderSecret);
  sent = viewed(founder.page);
  await founder.page.goto(viewedPath);
  expect((await sent).status()).toBe(200);
  await expect(viewCounts(founder.page).getByRole("definition")).toHaveText(["1", "1", "1"]);
  // The founder's view above was recorded for the site, but not for the product.
  sent = viewed(founder.page);
  await founder.page.reload();
  expect((await sent).status()).toBe(200);
  await expect(viewCounts(founder.page).getByRole("definition")).toHaveText(["1", "1", "1"]);
  await founder.context.close();

  // Other sites, bots and malformed beacons are refused or left out.
  const post = (headers: Record<string, string>, body: unknown) =>
    request.post("/api/analytics", {
      headers: { "Content-Type": "application/json", ...headers },
      data: body,
    });
  expect(
    (
      await post(
        { Origin: "https://evil.example", "User-Agent": chrome },
        { path: `/users/evil-${run}` },
      )
    ).status(),
  ).toBe(403);
  expect((await post({ Origin: baseURL, "User-Agent": chrome }, "not json")).status()).toBe(400);
  expect(
    (
      await post(
        { Origin: baseURL, "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
        { path: `/users/bot-${run}` },
      )
    ).status(),
  ).toBe(204);
  // Page time for a page view is only accepted from the visitor who made it.
  expect(
    (
      await post(
        { Origin: baseURL, "User-Agent": `${firefox} Other` },
        { type: "engagement", id: viewId, ms: 3_000_000 },
      )
    ).status(),
  ).toBe(204);

  // A signed-in admin is not counted, on the site or in the panel.
  const reader = await visit(chrome);
  const adminPage = reader.page;
  await login(adminPage, address, secret);
  sent = reader.beacon("pageview");
  await adminPage.goto(`/users/admin-${run}`);
  expect((await sent).status()).toBe(204);
  // Other signed-in users do not see a product's page views.
  await adminPage.goto(viewedPath);
  await expect(
    adminPage.getByRole("heading", { name: `Viewed ${run}`, exact: true }),
  ).toBeVisible();
  await expect(viewCounts(adminPage)).toHaveCount(0);

  // The reports hold the visits and nothing that was left out.
  const client = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.auth.signInWithPassword({ email: address, password: secret });
  const breakdown = async (dimension: string) => {
    const { data: report, error: readError } = await client.rpc("admin_analytics_breakdown", {
      p_range: "24h",
      p_tz: "UTC",
      p_dimension: dimension,
      p_limit: 100,
    });
    if (readError) throw new Error("Unable to read the statistics.");
    return (report as { rows: { value: string | null; time_on_page?: number | null }[] }).rows;
  };
  const pages = await breakdown("page");
  const paths = pages.map((row) => row.value);
  expect(paths).toEqual(expect.arrayContaining(["/about", "/privacy", "/stats"]));
  for (const left of [`/users/bot-${run}`, `/users/admin-${run}`, `/users/evil-${run}`])
    expect(paths).not.toContain(left);
  // The visible time was reported, and the other visitor's report was refused.
  const aboutTime = pages.find((row) => row.value === "/about")?.time_on_page ?? 0;
  expect(aboutTime).toBeGreaterThan(0);
  expect(aboutTime).toBeLessThan(60);
  expect((await breakdown("source")).map((row) => row.value)).toEqual(
    expect.arrayContaining([`e2e-${run}`, `news-${run}.example`]),
  );
  expect((await breakdown("utm_campaign")).map((row) => row.value)).toContain(`launch-${run}`);
  expect((await breakdown("browser")).map((row) => row.value)).toEqual(
    expect.arrayContaining(["Chrome", "Firefox"]),
  );
  expect((await breakdown("outbound")).map((row) => row.value)).toContain(
    `https://example-${run}.test/pricing`,
  );
  // Only this client's session; the browser stays signed in.
  await client.auth.signOut({ scope: "local" });

  // The panel: every card has its own period, and changing it neither reloads nor moves the page.
  await adminPage.goto("/admin");
  await adminPage
    .getByRole("navigation", { name: "Admin" })
    .getByRole("link", { name: "Analytics" })
    .click();
  await expect(adminPage).toHaveURL("/admin/analytics");
  const periodNames: Record<string, string> = {
    "24h": "24h, last 24 hours",
    "7d": "7d, last 7 days",
    "30d": "30d, last 30 days",
    "12m": "12m, last 12 months",
    All: "All, all time",
  };
  const card = (name: string) => adminPage.getByRole("region", { name, exact: true });
  const period = (name: string, label: string) =>
    card(name)
      .getByRole("group", { name: `Period for ${name}` })
      .getByRole("button", { name: periodNames[label], exact: true });
  const everyCard = adminPage.getByRole("group", { name: "Period for every card" });
  await everyCard.getByRole("button", { name: "24h, last 24 hours" }).click();
  await expect(period("Overview", "24h")).toHaveAttribute("aria-pressed", "true");
  await expect(card("Overview").getByRole("button", { name: /^Visitors/ })).toBeVisible();

  const pagesTable = card("Pages").getByRole("table");
  await expect(pagesTable.getByRole("link", { name: "/about" })).toHaveAttribute("href", "/about");
  await card("Pages").scrollIntoViewIfNeeded();
  const scrolled = await adminPage.evaluate(() => window.scrollY);
  await period("Pages", "7d").click();
  await expect(period("Pages", "7d")).toHaveAttribute("aria-pressed", "true");
  await expect(period("Overview", "24h")).toHaveAttribute("aria-pressed", "true");
  await expect(everyCard.getByRole("button", { name: "24h, last 24 hours" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(pagesTable.getByRole("link", { name: "/about" })).toBeVisible();
  expect(await adminPage.evaluate(() => window.scrollY)).toBe(scrolled);
  await expect(adminPage).toHaveURL("/admin/analytics");

  // Tabs switch the breakdown within a card.
  await card("Pages").getByRole("tab", { name: "Entry pages" }).click();
  await expect(card("Pages").getByRole("columnheader", { name: "Entry page" })).toBeVisible();
  // Local statistics keep every earlier run's sources and campaigns, so this run's can be past
  // the top 10 rows; the card then shows them all.
  const listed = (name: string, text: string) =>
    expect(async () => {
      const more = card(name).getByRole("button", { name: /^Show (all|the top 100)$/ });
      if (await more.count()) await more.click();
      await expect(card(name).getByText(text)).toBeVisible({ timeout: 2000 });
    }).toPass();
  await card("Sources").getByRole("tab", { name: "Sources" }).click();
  await listed("Sources", `e2e-${run}`);
  await card("Sources").getByRole("tab", { name: "Campaigns" }).click();
  await listed("Sources", `launch-${run}`);
  await expect(
    card("Links to other sites").getByRole("link", { name: new RegExp(`example-${run}`) }),
  ).toHaveAttribute("href", `https://example-${run}.test/pricing`);
  await expect(card("Right now").getByText(/in the last 5 minutes/)).toBeVisible();

  // The chart reads with the keyboard and as a table.
  const chart = card("Overview").getByRole("group", { name: /^Visitors, last 24 hours/ });
  await chart.focus();
  await adminPage.keyboard.press("Home");
  await card("Overview").getByRole("button", { name: "Show table" }).click();
  await expect(card("Overview").getByRole("table")).toBeVisible();
  // The periods are remembered in this browser.
  await adminPage.reload();
  await expect(period("Pages", "7d")).toHaveAttribute("aria-pressed", "true");

  // Every period in both themes, and no sideways scrolling on a phone.
  const loaded = () => expect(adminPage.locator(".animate-pulse")).toHaveCount(0);
  for (const theme of ["dark", "light"] as const) {
    await setThemeCookie(adminPage, theme);
    await adminPage.reload();
    for (const label of ["24h", "7d", "30d", "12m", "All"]) {
      await everyCard.getByRole("button", { name: periodNames[label], exact: true }).click();
      await loaded();
      await expect(adminPage.locator("[aria-busy=true]")).toHaveCount(0);
      await expectAccessible(adminPage);
    }
  }
  await adminPage.setViewportSize({ width: 390, height: 844 });
  await adminPage.reload();
  await loaded();
  await expectNoHorizontalScroll(adminPage);
  await reader.context.close();
  expect(violations).toEqual([]);
});

test("users get one email per unread conversation, and can turn it off", async ({
  page,
  request,
}) => {
  const makers = [];
  for (const label of ["sender", "recipient"]) {
    const address = `harbor-mail-${label}-${run}@example.test`;
    const secret = randomBytes(24).toString("hex");
    const { data, error } = await admin.auth.admin.createUser({
      email: address,
      password: secret,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error("Unable to create a notification fixture.");
    userIds.push(data.user.id);
    const name = `Mail ${label} ${run}`;
    const { error: profileError } = await admin.from("profiles").insert({ id: data.user.id, name });
    if (profileError) throw new Error("Unable to create a notification profile.");
    const client = createClient(url, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await client.auth.signInWithPassword({ email: address, password: secret });
    makers.push({ id: data.user.id, email: address, password: secret, name, client });
  }
  const [sender, recipient] = makers;
  const write = async (body: string) => {
    const { error } = await sender.client.rpc("send_message", {
      p_recipient: recipient.id,
      p_body: body,
    });
    if (error) throw new Error("Unable to send a fixture message.");
  };
  const read = async () => {
    const { data } = await recipient.client.from("conversations").select("id").single();
    await recipient.client.rpc("mark_conversation_read", {
      p_conversation: data!.id,
      p_read_at: new Date().toISOString(),
    });
  };
  const count = async () => (await inbox(request, recipient.email)).length;

  // The first unread message brings an email with the sender and a link, never the message.
  await write(`Secret plan ${run}`);
  await sendDueEmails(request);
  await expect.poll(count).toBe(1);
  const [first] = await inbox(request, recipient.email);
  expect(first.Subject).toBe(`New message from ${sender.name}`);
  const email = await emailText(request, first.ID);
  expect(email.Text).toContain(`/messages/${sender.id}`);
  expect(email.Text).not.toContain("Secret plan");
  expect(email.HTML).not.toContain("Secret plan");

  // More messages before the recipient reads bring nothing, a message after reading does.
  await write("Another one");
  await sendDueEmails(request);
  await read();
  await write("After reading");
  await sendDueEmails(request);
  await expect.poll(count).toBe(2);

  // The recipient turns message emails off, and on again, in their settings.
  await login(page, recipient.email, recipient.password);
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL("/dashboard/settings");
  const setting = page.getByRole("checkbox", { name: /New messages from other users/ });
  // Waits for the save itself: the confirmation text stays on screen between saves.
  const save = async () => {
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/dashboard/settings",
      ),
      page.getByRole("button", { name: "Save settings" }).click(),
    ]);
    await expect(page.getByText("Settings saved.")).toBeVisible();
  };
  await expect(setting).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /New reports/ })).toHaveCount(0);
  await setting.uncheck();
  await save();
  await expect(setting).not.toBeChecked();
  await read();
  await write("While emails are off");
  await sendDueEmails(request);
  await setting.check();
  await save();
  await read();
  await write("Emails are on again");
  await sendDueEmails(request);
  // Three emails in all: the message written while emails were off brought none.
  await expect.poll(count).toBe(3);

  for (const theme of ["dark", "light"] as const) {
    await setThemeCookie(page, theme);
    await page.goto("/dashboard/settings");
    await expectAccessible(page);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
});

// Statistics show once five products share verified MRR, and add up exactly the leaderboard's
// figures. The local database may rank other products too, so expectations read the leaderboard.
test("statistics add up the leaderboard's figures once five products share them", async ({
  page,
}) => {
  const violations: string[] = [];
  watchPolicy(page, violations);
  const { data: before } = await anon.from("leaderboard").select("id");
  if (before!.length < 5) {
    await page.goto("/stats");
    await expect(page.getByRole("heading", { name: "Not enough products yet" })).toBeVisible();
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email: `harbor-stats-${run}@example.test`,
    password: randomBytes(24).toString("hex"),
    email_confirm: true,
  });
  if (error || !created.user) throw new Error("Unable to create the statistics maker.");
  const maker = created.user.id;
  userIds.push(maker);
  await admin.from("profiles").upsert({ id: maker, name: `Stats Maker ${run}` });
  // Twelve month-ends before this month, like a real verification's history.
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12 + i, 1));
    return date.toISOString().slice(0, 7);
  });
  for (const [index, mrr] of [0, 5_000, 150_000, 2_000_000, 120_000].entries()) {
    const id = randomUUID();
    const { error: saasError } = await admin.from("saas").insert({
      id,
      owner_id: maker,
      name: `Stats ${run} ${index}`,
      tagline: "A statistics fixture.",
      description: "A local statistics fixture, removed after the test.",
      category: "Analytics",
      website: "https://example.com",
    });
    expect(saasError).toBeNull();
    await admin
      .from("saas_settings")
      .insert({ saas_id: id, owner_id: maker, share_mrr: true, share_customers: true });
    const { error: verifyError } = await admin.rpc("record_revenue_verification", {
      p_saas_id: id,
      p_provider: "stripe",
      p_encrypted_key: "v1:stats",
      p_key_hint: "rk_test_…stat",
      p_livemode: false,
      p_mrr_cents: mrr,
      p_customers: index,
      p_currencies: {},
      p_fx_date: null,
      p_subscription_hashes: [createHash("sha256").update(id).digest("hex")],
      p_history: months.map((month, i) => ({ month, mrr_cents: Math.round((mrr * (i + 1)) / 12) })),
      p_mrr_invoice_cents: mrr,
      p_mrr_30d_ago_cents: mrr ? mrr / 2 : null,
    });
    expect(verifyError).toBeNull();
  }

  const { data: ranked } = await anon.from("leaderboard").select("mrr_cents");
  const total = ranked!.reduce((sum, row) => sum + (row.mrr_cents ?? 0), 0);
  const usd = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: total % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(total / 100);
  await page.goto("/stats");
  await expect(page.getByRole("heading", { name: "Statistics", level: 1 })).toBeVisible();
  const figure = (label: string) =>
    page.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd[1]");
  await expect(figure("Verified MRR, combined")).toHaveText(usd);
  await expect(figure("Products ranked")).toHaveText(String(ranked!.length));
  await expect(
    page.getByRole("list", { name: "Products by MRR" }).getByRole("listitem"),
  ).toHaveCount(5);
  await expect(
    page.getByRole("table", { name: "Ranked products by category" }).getByRole("link", {
      name: "Analytics",
    }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fastest growing" })).toBeVisible();
  if (!before!.length)
    await expect(page.getByRole("heading", { name: "Combined MRR at month end" })).toBeVisible();
  const card = await page.request.get("/stats/opengraph-image");
  expect(card.status()).toBe(200);
  expect(card.headers()["content-type"]).toBe("image/png");
  expect(await (await page.request.get("/sitemap.xml")).text()).toContain("/stats</loc>");

  for (const theme of ["dark", "light"] as const) {
    await setThemeCookie(page, theme);
    await page.goto("/stats");
    await expectAccessible(page);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  expect(violations).toEqual([]);
});

// Paddle, Polar and Dodo Payments verify revenue like Stripe. A product connects one provider at a
// time, and a new key may switch it to another.
test("founders verify revenue through Paddle, Polar and Dodo Payments", async ({ page }) => {
  const violations: string[] = [];
  watchPolicy(page, violations);
  const address = `harbor-providers-${run}@example.test`;
  const secret = randomBytes(24).toString("hex");
  const { data: created, error } = await admin.auth.admin.createUser({
    email: address,
    password: secret,
    email_confirm: true,
  });
  if (error || !created.user) throw new Error("Unable to create the provider maker.");
  userIds.push(created.user.id);
  await login(page, address, secret);
  await page.goto("/dashboard/saas/new");
  await fillProduct(page, `Providers ${run}`);
  await page.getByRole("button", { name: "Add SaaS", exact: true }).click();
  await expect(page).toHaveURL(/created=1/);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  const revenue = page.locator("#revenue");
  for (const theme of ["dark", "light"] as const) {
    await setThemeCookie(page, theme);
    await page.reload();
    await expectAccessible(page);
  }

  // Paddle: each subscription is valued by its latest full charge, without tax.
  await revenue.getByRole("radio", { name: "Paddle" }).check();
  await expect(revenue.getByText("Give it Read for Subscriptions and Transactions")).toBeVisible();
  await revenue.getByLabel("API key", { exact: true }).fill(`pdl_live_apikey_${"a".repeat(50)}`);
  await revenue.getByRole("button", { name: "Connect and verify" }).click();
  await expect(
    revenue.getByRole("alert").filter({ hasText: "Paste a Paddle API key" }),
  ).toBeVisible();
  await revenue.getByLabel("API key", { exact: true }).fill(PADDLE_KEYS.one);
  await revenue.getByRole("button", { name: "Connect and verify" }).click();
  await expect(revenue.getByText("Connected to Paddle")).toBeVisible();
  await expect(revenue.getByText("$182.50", { exact: true })).toBeVisible();
  await page.goto(`/saas/providers-${run}`);
  await expect(page.getByText(/Verified with Paddle through a read-only key/)).toBeVisible();

  // Polar: a new token switches the provider.
  await page.goto(`/dashboard/saas/${id}`);
  await revenue.getByText("Replace the key or change the provider").click();
  await revenue.getByRole("radio", { name: "Polar" }).check();
  await revenue.getByLabel("New organization access token", { exact: true }).fill(POLAR_TOKENS.one);
  await revenue.getByRole("button", { name: "Replace and verify" }).click();
  await expect(revenue.getByText("Connected to Polar")).toBeVisible();
  await expect(
    revenue.getByText(/^Polar connected\. Verified MRR: \$59\.17 from 3 paying customers\./),
  ).toBeVisible();
  await expect(revenue.getByText("$59.17", { exact: true })).toBeVisible();

  // Dodo Payments, from the same open form: MRR without history, and the maker is told why.
  await revenue.getByRole("radio", { name: "Dodo Payments" }).check();
  await revenue.getByLabel("New API key", { exact: true }).fill(DODO_KEYS.one);
  await revenue.getByRole("button", { name: "Replace and verify" }).click();
  await expect(revenue.getByText("Connected to Dodo Payments")).toBeVisible();
  await expect(revenue.getByText("$50", { exact: true })).toBeVisible();
  await expect(
    revenue.getByText(
      "No revenue history: Dodo Payments does not say which period a payment covers.",
    ),
  ).toBeVisible();
  const { data: connection } = await admin
    .from("revenue_connections")
    .select("provider, key_hint, livemode, encrypted_key")
    .eq("saas_id", id)
    .single();
  expect(connection).toMatchObject({ provider: "dodo", key_hint: "…0001", livemode: false });
  expect(connection!.encrypted_key).not.toContain("harborfixture");
  const { data: snapshots } = await admin
    .from("revenue_snapshots")
    .select("provider")
    .eq("saas_id", id)
    .order("seq");
  expect(snapshots!.map((row) => row.provider)).toEqual(["paddle", "polar", "dodo"]);
  expect(violations).toEqual([]);
});
