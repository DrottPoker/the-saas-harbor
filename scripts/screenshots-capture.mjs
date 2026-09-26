import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Takes the screenshots that are due through the local dev server, as the scheduled production job
// does. The local Chromium from Playwright takes them.
const env = parseEnv(readFileSync(".env.local", "utf8"));
const origin = env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";
if (!env.CRON_SECRET) throw new Error("CRON_SECRET is missing. Run `npm run env:local` first.");
const response = await fetch(new URL("/api/screenshots/capture", origin), {
  method: "POST",
  headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
}).catch(() => {
  throw new Error(`The app is not reachable at ${origin}. Start it with \`npm run dev\`.`);
});
if (!response.ok) throw new Error(`Screenshots failed with HTTP ${response.status}.`);
const { taken, failed } = await response.json();
console.log(`Screenshots: ${taken} taken, ${failed} failed.`);
