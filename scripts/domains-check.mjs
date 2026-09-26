import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Looks up the DNS records of the verified domains that are due through the local dev server, as
// the scheduled production job does.
const env = parseEnv(readFileSync(".env.local", "utf8"));
const origin = env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";
if (!env.CRON_SECRET) throw new Error("CRON_SECRET is missing. Run `npm run env:local` first.");
const response = await fetch(new URL("/api/domains/check", origin), {
  method: "POST",
  headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
}).catch(() => {
  throw new Error(`The app is not reachable at ${origin}. Start it with \`npm run dev\`.`);
});
if (!response.ok) throw new Error(`The domain check failed with HTTP ${response.status}.`);
const counts = await response.json();
console.log(
  `Domains: ${counts.verified} still verified, ${counts.grace} missing their record, ${counts.removed} no longer verified, ${counts.error + counts.failed} not checked.`,
);
