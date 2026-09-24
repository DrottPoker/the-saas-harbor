import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
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
  for (const user of data.users.filter(
    (user) => user.email === email || user.email === secondEmail,
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
    if (error) throw new Error("Local fixture cleanup failed.");
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
  for (const path of ["/", "/discover", "/auth"]) {
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
  for (const path of ["/discover", "/newest", "/about", "/auth", "/auth?mode=signup", "/missing"]) {
    await page.goto(path);
    await expectAccessible(page);
  }
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
  await page
    .getByLabel("Upload logo")
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
  await page.getByLabel("Monthly recurring revenue (USD)").fill("-25");
  await page.getByRole("button", { name: "Add SaaS", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Enter a USD amount" })).toBeVisible();
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(productName);
  await page
    .getByLabel("Upload logo")
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
  await page.getByLabel("Monthly recurring revenue (USD)").fill("9876543.21");
  await page.getByLabel("Paying customers", { exact: true }).fill("123");
  await page.getByRole("button", { name: "Add SaaS", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\?saved=/);
  productId = new URL(page.url()).searchParams.get("saved")!;
  await page.goto(`/saas/${productId}`);
  await expect(page.getByRole("heading", { name: productName, exact: true })).toBeVisible();
  await expect(page).toHaveTitle(`${productName} | The SaaS Harbor`);
  expect(await page.content()).not.toContain("9876543");
  await expect(page.getByText("Not shared", { exact: true })).toHaveCount(3);
  const { data: publicData } = await anon
    .from("public_saas")
    .select("*")
    .eq("id", productId)
    .single();
  expect(publicData.mrr_cents).toBeNull();
  expect(publicData.customers).toBeNull();
  const { error: historyError } = await anon.from("metric_reports").select("*");
  expect(historyError?.code).toBe("42501");
  await page.goto(`/dashboard/saas/${productId}`);
  await expect(page.getByLabel("Monthly recurring revenue (USD)")).toHaveValue("9876543.21");
  await page.getByLabel("Monthly recurring revenue (USD)").fill("1234.56");
  await page.getByLabel("Share MRR publicly", { exact: true }).check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/saved=/);
  await page.goto(`/?q=${encodeURIComponent(productName)}`);
  await expect(
    page.getByRole("link").filter({ hasText: productName }).getByText("$1,234.56", { exact: true }),
  ).toBeVisible();
  // Audit pages while they show real, shared data.
  await expectAccessible(page);
  for (const path of [
    `/saas/${productId}`,
    `/makers/${firstUserId}`,
    "/discover",
    "/dashboard",
    `/dashboard/saas/${productId}`,
    "/dashboard/profile",
  ]) {
    await page.goto(path);
    await expectAccessible(page);
  }
  await page.goto(`/dashboard/saas/${productId}`);
  await page.getByLabel("Share MRR publicly", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/saved=/);
  await page.goto(`/?q=${encodeURIComponent(productName)}`);
  await expect(page.getByText(productName, { exact: true })).toHaveCount(0);
  await page.goto(`/discover?q=${encodeURIComponent(productName)}`);
  await expect(page.getByRole("heading", { name: productName, exact: true })).toBeVisible();
  await page.goto("/dashboard/saas/new");
  await fillProduct(page, `Second ${run}`);
  await page.getByRole("button", { name: "Add SaaS", exact: true }).click();
  await expect(page).toHaveURL(/saved=/);
  await expect(page.getByRole("list", { name: "Your products" }).getByRole("listitem")).toHaveCount(
    2,
  );
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
  const { data: reports, error: readError } = await other
    .from("metric_reports")
    .select("*")
    .eq("saas_id", productId);
  expect(readError).toBeNull();
  expect(reports).toEqual([]);
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
