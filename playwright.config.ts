import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1, retries: 0,
  timeout: 90000, expect: { timeout: 15000 },
  use: { baseURL: "http://127.0.0.1:3001", trace: "off", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "npm run dev -- --port 3001", url: "http://127.0.0.1:3001", reuseExistingServer: false, timeout: 120000 },
});
