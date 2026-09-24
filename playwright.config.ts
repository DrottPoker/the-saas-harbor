import { defineConfig, devices } from "@playwright/test";
// Port 3002 keeps the test server clear of the regular dev server on 3001. The fake Stripe API
// on 3011 replaces Stripe and the exchange-rate service (see tests/e2e/fake-stripe.mjs).
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90000,
  expect: { timeout: 15000 },
  use: { baseURL: "http://127.0.0.1:3002", trace: "off", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tests/e2e/fake-stripe.mjs",
      url: "http://127.0.0.1:3011/health",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: "npx next dev --hostname 127.0.0.1 --port 3002",
      url: "http://127.0.0.1:3002",
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
