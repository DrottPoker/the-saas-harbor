import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Runs the scheduled Stripe re-verification against the local dev server.
// In production a scheduler calls POST /api/stripe/sync with the same bearer secret.
const env = parseEnv(readFileSync(".env.local", "utf8"));
const origin = env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";
if (!env.CRON_SECRET) throw new Error("CRON_SECRET is missing. Run `npm run env:local` first.");
const response = await fetch(new URL("/api/stripe/sync", origin), {
  method: "POST",
  headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
}).catch(() => {
  throw new Error(`The app is not reachable at ${origin}. Start it with \`npm run dev\`.`);
});
if (!response.ok) throw new Error(`Stripe sync failed with HTTP ${response.status}.`);
const { ok, failed } = await response.json();
console.log(`Stripe sync: ${ok} verified, ${failed} failed.`);
