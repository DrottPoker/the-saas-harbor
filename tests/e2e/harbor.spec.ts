import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";

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
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Independent SaaS, ranked by revenue" }),
  ).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth$/);
  await page.goto(`/discover?category=Design&q=missing-${run}`);
  await expect(page.getByRole("heading", { name: "No matching products" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/discover", "/auth", "/privacy"]) {
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
  const publicPages = [
    "/discover",
    "/newest",
    "/about",
    "/privacy",
    "/account-deleted",
    "/auth",
    "/auth?mode=signup",
    "/missing",
  ];
  for (const path of publicPages) {
    await page.goto(path);
    await expectAccessible(page);
  }
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
  for (const path of ["/", "/discover", "/newest", "/about", "/privacy", "/auth", "/missing"]) {
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
  page,
  request,
}) => {
  test.setTimeout(180000);
  await page.goto("/auth?mode=signup");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/Check your email to confirm/)).toBeVisible();
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
  const confirmation = message.HTML.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)?.[1]?.replaceAll(
    "&amp;",
    "&",
  );
  if (!confirmation || !confirmation.startsWith(`${url}/`))
    throw new Error("A local confirmation link is required.");
  await page.goto(confirmation);
  await expect(page).toHaveURL(/\/dashboard$/);
  const users = await admin.auth.admin.listUsers();
  firstUserId = users.data.users.find((user) => user.email === email)!.id;
  userIds.push(firstUserId);
  await page.goto("/dashboard/profile");
  await page.getByLabel("Name", { exact: true }).fill("Local Test Maker");
  await page.getByLabel("Bio").fill("An isolated maker profile for browser verification.");
  await page.getByLabel("Website", { exact: true }).fill("https://example.com");
  await page.getByLabel("Upload photo").setInputFiles({
    name: "invalid.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Choose a valid PNG" })).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Local Test Maker");
  await page
    .getByLabel("Upload photo")
    .setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await page.goto(`/makers/${firstUserId}`);
  await expect(page.getByRole("heading", { name: "Local Test Maker", exact: true })).toBeVisible();
  await expect(page).toHaveTitle("Local Test Maker | The SaaS Harbor");
  const image = page.getByRole("img", { name: "Local Test Maker" });
  await expect(image).toBeVisible();
  expect(
    await image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
  ).toBe(true);
  await page.goto("/dashboard/saas/new");
  await fillProduct(page, productName);
  await page.getByLabel("Upload logo").setInputFiles({
    name: "invalid.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await page.getByRole("button", { name: "Add SaaS", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Choose a valid PNG" })).toBeVisible();
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(productName);
  await page
    .getByLabel("Upload logo")
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Add SaaS", exact: true }).click();
  // New products continue straight to Stripe verification.
  await expect(page).toHaveURL(/\/dashboard\/saas\/[0-9a-f-]{36}\?created=1/);
  productId = new URL(page.url()).pathname.split("/").at(-1)!;
  await expect(
    page.getByText("Product added. Connect Stripe to verify its revenue."),
  ).toBeVisible();

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
    .from("stripe_connections")
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
  for (const table of ["revenue_snapshots", "stripe_connections"]) {
    const { error: denied } = await anon.from(table).select("*");
    expect(denied?.code, table).toBe("42501");
  }
  await page.goto(`/dashboard/saas/${productId}`);
  await page.getByLabel("Show verified MRR publicly", { exact: true }).check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/saved=/);
  await page.goto(`/?q=${encodeURIComponent(productName)}`);
  const row = page.getByRole("link").filter({ hasText: productName });
  await expect(row.getByText("$104", { exact: true })).toBeVisible();
  // Shared MRR brings its invoice history: a trend line and 30-day growth on the leaderboard,
  // and a month-end chart with a table view on the product page.
  await expect(row.getByText("+92.6%", { exact: true })).toBeVisible();
  await expect(row.locator("polyline")).toHaveCount(1);
  await page.goto(`/saas/${productId}`);
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
    `/makers/${firstUserId}`,
    "/discover",
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
    page.getByRole("alert").filter({ hasText: "verified in the last few minutes" }),
  ).toBeVisible();
  await admin
    .from("stripe_connections")
    .update({ last_synced_at: new Date(Date.now() - 10 * 60_000).toISOString() })
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
    .from("stripe_connections")
    .select("saas_id", { count: "exact", head: true })
    .eq("saas_id", productId);
  expect(remaining).toBe(0);
  const { data: afterDisconnect } = await anon
    .from("public_saas")
    .select("revenue_status")
    .eq("id", productId)
    .single();
  expect(afterDisconnect?.revenue_status).toBe("unverified");
  await page.goto(`/dashboard/saas/${secondId}`);
  await page.getByLabel("Restricted key", { exact: true }).fill("rk_test_harborfixture0002");
  await page.getByRole("button", { name: "Connect and verify" }).click();
  await expect(page.locator("#revenue").getByText("Connected to Stripe")).toBeVisible();
  // This key cannot read invoices, so MRR is verified without history and the maker is told why.
  await expect(page.getByText(/No revenue history yet/)).toBeVisible();

  // The scheduled sync endpoint refuses callers without the secret.
  expect((await request.post("/api/stripe/sync")).status()).toBe(401);
  expect(
    (
      await request.post("/api/stripe/sync", { headers: { Authorization: "Bearer wrong" } })
    ).status(),
  ).toBe(401);
  // The signed-in header carries extra links, so check it separately on a phone-sized screen.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/dashboard", `/dashboard/saas/${productId}`, `/saas/${productId}`]) {
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
  for (const table of ["revenue_snapshots", "stripe_connections"]) {
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
  const link = message.HTML.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)?.[1]?.replaceAll(
    "&amp;",
    "&",
  );
  if (!link || !link.startsWith(`${url}/`)) throw new Error("A local reset link is required.");
  await page.goto(link);
  await expect(page).toHaveURL(/mode=update/);
  const replacement = randomBytes(24).toString("hex");
  await page.getByLabel("New password").fill(replacement);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, email, replacement);
});

test("a maker deletes products, then their account and everything in it", async ({ page }) => {
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
  const { error: profileError } = await maker.from("profiles").upsert({
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
    const { error: verifyError } = await admin.rpc("record_stripe_verification", {
      p_saas_id: productId,
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
    "stripe_connections",
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
    ["stripe_connections", "owner_id"],
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

test("makers message each other live, with unread counts and blocking", async ({ browser }) => {
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
  const open = async () => {
    const page = await (await browser.newContext({ baseURL })).newPage();
    page.on("console", (message) => {
      if (message.type() === "error" && /hydrat/i.test(message.text()))
        hydrationErrors.push(message.text());
    });
    return page;
  };

  // The reader waits on the dashboard; the unread count must arrive without a reload.
  const readerPage = await open();
  await login(readerPage, reader.email, reader.password);

  // A visitor who chooses Send message signs in and continues in the conversation.
  const writerPage = await open();
  await writerPage.goto(`/makers/${reader.id}`);
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
  await expect(readerPage.getByRole("link", { name: "Messages", exact: true })).toBeVisible();

  // Replies arrive in the open conversation without a reload, and are read there at once.
  await readerPage.getByLabel(`Message to ${writer.name}`).fill("Yes, happy to talk.");
  await readerPage.getByRole("button", { name: "Send", exact: true }).click();
  await expect(writerLog.getByText("Yes, happy to talk.")).toBeVisible();
  await expect(writerPage.getByRole("link", { name: "Messages", exact: true })).toBeVisible();

  // A block stops messages in both directions until it is lifted. A refused message stays.
  await readerPage.getByRole("button", { name: `Block ${writer.name}` }).click();
  await expect(readerPage.getByText(`You blocked ${writer.name}.`)).toBeVisible();
  await writerField.fill("Are you there?");
  await writerSend.click();
  await expect(
    writerPage
      .getByRole("alert")
      .filter({ hasText: "Messages between you and this maker are blocked." }),
  ).toBeVisible();
  await expect(writerField).toHaveValue("Are you there?");
  await readerPage.getByRole("button", { name: `Unblock ${writer.name}` }).click();
  await expect(readerPage.getByLabel(`Message to ${writer.name}`)).toBeVisible();
  await writerSend.click();
  await expect(readerPage.getByRole("log").getByText("Are you there?")).toBeVisible();

  // Makers cannot message themselves.
  await writerPage.goto(`/makers/${writer.id}`);
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
});
