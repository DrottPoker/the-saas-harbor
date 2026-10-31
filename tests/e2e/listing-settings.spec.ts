import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { termsUpdated } from "../../src/lib/legal";
import { expectAccessible } from "./accessibility";

const url = process.env.TEST_SUPABASE_URL!;
if (!url || new URL(url).hostname !== "127.0.0.1") throw new Error("Local Supabase required.");
const service = createClient(url, process.env.TEST_SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const anon = createClient(url, publicKey, { auth: { persistSession: false } });

async function login(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function choose(page: Page, provider: string) {
  await page.getByRole("combobox", { name: "Payment provider" }).click();
  await page.getByRole("option", { name: provider, exact: true }).click();
}

async function fillProduct(page: Page, name: string) {
  await page.getByLabel("Product name", { exact: true }).fill(name);
  await page.getByLabel("Tagline").fill("A local listing policy test product.");
  await page
    .getByLabel("Description")
    .fill("This local fixture tests the provider connection requirement.");
  await page.getByLabel("Category").selectOption("Productivity");
  await page.getByLabel("Website", { exact: true }).fill("example.com");
  await page.getByLabel("Launch date", { exact: true }).fill("2025-06-01");
}

test("admins control Other and new listings wait for a successful connection", async ({
  browser,
}, info) => {
  test.setTimeout(180000);
  const ids: string[] = [];
  const run = randomUUID().slice(0, 8);
  const moderator = createClient(url, publicKey, { auth: { persistSession: false } });
  const { data: original } = await anon.rpc("listing_settings");
  const contexts = await Promise.all([
    browser.newContext({ baseURL: "http://127.0.0.1:3002" }),
    browser.newContext({ baseURL: "http://127.0.0.1:3002" }),
    browser.newContext({ baseURL: "http://127.0.0.1:3002" }),
  ]);
  const [adminPage, makerPage, visitor] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  try {
    const people = [];
    for (const role of ["admin", "maker"]) {
      const email = `listing-${role}-${run}@example.test`;
      const password = randomBytes(24).toString("hex");
      const { data, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username: `listing-${role}-${run}`, terms_version: termsUpdated },
      });
      if (error || !data.user) throw new Error("Listing fixture could not be created.");
      ids.push(data.user.id);
      people.push({ email, password, id: data.user.id });
    }
    const [admin, maker] = people;
    expect(
      (await service.rpc("set_admin", { p_email: admin.email, p_admin: true })).error,
    ).toBeNull();
    expect((await moderator.auth.signInWithPassword(admin)).error).toBeNull();
    expect(
      (await moderator.rpc("admin_update_listing_settings", { p_allow_other_provider: true }))
        .error,
    ).toBeNull();
    await login(adminPage, admin.email, admin.password);
    await login(makerPage, maker.email, maker.password);
    await makerPage.goto("/admin/settings");
    await expect(makerPage.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await visitor.goto("/admin/settings");
    await expect(visitor.getByRole("heading", { name: "Page not found" })).toBeVisible();

    // An already open form must obey a policy changed after it was loaded.
    await makerPage.goto("/dashboard/saas/new");
    await choose(makerPage, "Other");
    await makerPage.getByLabel("Your payment provider").fill("Unsupported provider");
    await fillProduct(makerPage, `Stale listing ${run}`);
    await adminPage.goto("/admin");
    await adminPage
      .getByRole("navigation", { name: "Admin", exact: true })
      .getByRole("link", { name: "Settings" })
      .click();
    const setting = adminPage.getByRole("checkbox", {
      name: "Hide Other and require a provider connection",
    });
    await setting.check();
    await adminPage.getByRole("button", { name: "Save settings" }).click();
    await expect(adminPage.getByText("Listing settings saved.")).toBeVisible();
    await expect(setting).toBeChecked();
    await adminPage.reload();
    await expect(setting).toBeChecked();
    for (const theme of ["light", "dark"]) {
      await adminPage
        .context()
        .addCookies([{ name: "theme", value: theme, url: "http://127.0.0.1:3002" }]);
      for (const width of [390, 1440]) {
        await adminPage.setViewportSize({ width, height: 900 });
        await adminPage.reload();
        await expectAccessible(adminPage);
        expect(
          await adminPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
        await adminPage.screenshot({
          path: info.outputPath(`settings-${width}-${theme}.png`),
          fullPage: true,
        });
      }
    }
    await makerPage.getByRole("button", { name: "Add SaaS", exact: true }).click();
    await expect(
      makerPage.getByText("Choose a supported payment provider to list your SaaS."),
    ).toBeVisible();
    expect((await service.from("saas").select("id").eq("owner_id", maker.id)).data).toEqual([]);

    await visitor.goto("/");
    await expect(
      visitor.getByText("New listings require a payment provider connection.", { exact: false }),
    ).toBeVisible();
    await visitor.goto("/list-your-saas");
    await expect(
      visitor.getByText("Yes. Connect a supported payment provider even if its revenue is zero.", {
        exact: false,
      }),
    ).toBeVisible();

    await makerPage.reload();
    const choice = makerPage.getByRole("combobox", { name: "Payment provider" });
    await expect(choice).toHaveAttribute("aria-required", "true");
    await choice.click();
    await expect(makerPage.getByRole("option", { name: "Other", exact: true })).toHaveCount(0);
    await makerPage.getByRole("option", { name: "Stripe", exact: true }).click();
    const name = `Pending listing ${run}`;
    await fillProduct(makerPage, name);
    await makerPage.getByLabel("Restricted key", { exact: true }).fill("rk_test_harbornoperm00001");
    await makerPage.getByRole("button", { name: "Add SaaS and verify revenue" }).click();
    await expect(makerPage).toHaveURL(/\/dashboard\/saas\/[0-9a-f-]{36}\?connection=1/);
    const id = new URL(makerPage.url()).pathname.split("/").at(-1)!;
    await expect(
      makerPage.getByText("Your product is saved privately.", { exact: false }),
    ).toBeVisible();
    const { data: draft } = await service
      .from("saas")
      .select("slug,listing_pending")
      .eq("id", id)
      .single();
    expect(draft?.listing_pending).toBe(true);
    expect((await anon.from("public_saas").select("id").eq("id", id)).data).toEqual([]);
    for (const path of [
      `/saas/${id}`,
      `/saas/${draft!.slug}`,
      `/saas/${draft!.slug}.md`,
      `/saas/${draft!.slug}/badge.svg`,
    ])
      expect((await visitor.request.get(path)).status()).toBe(404);
    expect(await (await visitor.request.get("/sitemap.xml")).text()).not.toContain(
      `/saas/${draft!.slug}`,
    );
    await makerPage.goto("/dashboard");
    const row = makerPage.getByRole("listitem").filter({ hasText: name });
    await expect(row.getByText("Pending connection")).toBeVisible();
    await expect(row.getByRole("link", { name: "View", exact: true })).toHaveCount(0);
    await row.getByRole("link", { name: "Edit", exact: true }).click();
    await choose(makerPage, "Stripe");
    await makerPage.getByLabel("Restricted key", { exact: true }).fill("rk_test_harborfixture0001");
    await makerPage.getByRole("button", { name: "Save and verify revenue" }).click();
    const share = makerPage.getByRole("dialog", { name: `${name} is listed` });
    await expect(share).toBeVisible();
    await share.getByRole("button", { name: "Not now" }).click();
    await expect(makerPage.getByText("Connected to Stripe")).toBeVisible();
    await expect(
      makerPage.getByText("Your product is saved privately.", { exact: false }),
    ).toHaveCount(0);
    expect((await anon.from("public_saas").select("id").eq("id", id)).data).toEqual([{ id }]);
    expect((await visitor.request.get(`/saas/${draft!.slug}`)).status()).toBe(200);

    await adminPage.goto("/admin/settings");
    await setting.uncheck();
    await adminPage.getByRole("button", { name: "Save settings" }).click();
    await expect(adminPage.getByText("Listing settings saved.")).toBeVisible();
    await expect(setting).not.toBeChecked();
    await makerPage.goto("/dashboard/saas/new");
    await choose(makerPage, "Other");
    await expect(makerPage.getByLabel("Your payment provider")).toBeVisible();
  } finally {
    await moderator.rpc("admin_update_listing_settings", {
      p_allow_other_provider: original ?? true,
    });
    await Promise.all(contexts.map((context) => context.close()));
    for (const id of ids) await service.auth.admin.deleteUser(id);
  }
});
