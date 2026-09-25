import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Sends due notification emails through the local dev server, as the scheduled production job
// does. Locally they arrive in Mailpit.
const env = parseEnv(readFileSync(".env.local", "utf8"));
const origin = env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";
if (!env.CRON_SECRET) throw new Error("CRON_SECRET is missing. Run `npm run env:local` first.");
const response = await fetch(new URL("/api/email/send", origin), {
  method: "POST",
  headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
}).catch(() => {
  throw new Error(`The app is not reachable at ${origin}. Start it with \`npm run dev\`.`);
});
if (!response.ok) throw new Error(`Sending failed with HTTP ${response.status}.`);
const { configured, sent, skipped, failed } = await response.json();
console.log(
  configured
    ? `Emails: ${sent} sent, ${skipped} skipped, ${failed} failed.`
    : "Emails are off: set SMTP_HOST and EMAIL_FROM (npm run env:local does it for Mailpit).",
);
