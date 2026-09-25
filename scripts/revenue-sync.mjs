import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Runs the scheduled revenue re-verification against the local dev server.
// In production a scheduler calls POST /api/revenue/sync with the same bearer secret.
const env = parseEnv(readFileSync(".env.local", "utf8"));
const origin = env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";
if (!env.CRON_SECRET) throw new Error("CRON_SECRET is missing. Run `npm run env:local` first.");
const response = await fetch(new URL("/api/revenue/sync", origin), {
  method: "POST",
  headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
}).catch(() => {
  throw new Error(`The app is not reachable at ${origin}. Start it with \`npm run dev\`.`);
});
if (!response.ok) throw new Error(`Revenue sync failed with HTTP ${response.status}.`);
const { ok, failed, due } = await response.json();
console.log(`Revenue sync: ${ok} verified, ${failed} failed, ${due} still due.`);
