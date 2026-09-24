import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { emailDelivery, ensureLocalSupabase } from "./local-supabase.mjs";

// Runs before `npm run dev`: starts local Supabase if needed and points .env.local at it.
// Only the keys below are managed; any other lines in .env.local are kept.
const local = ensureLocalSupabase();
const delivery = emailDelivery();
const managed = {
  NEXT_PUBLIC_SUPABASE_URL: local.url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.publishableKey,
  NEXT_PUBLIC_SITE_URL: "http://localhost:3001",
  // Only while emails go to Mailpit; with real delivery the sign-in pages show no inbox link.
  LOCAL_MAILPIT_URL: delivery === "mailpit" ? local.mailpit : undefined,
};
const header = "# Managed by scripts/local-env.mjs from the local Supabase stack.";
const path = ".env.local";
const previous = existsSync(path) ? readFileSync(path, "utf8") : "";
const kept = previous
  .split(/\r?\n/)
  .filter((line) => line.trim() && line !== header)
  .filter((line) => !Object.keys(managed).some((key) => line.startsWith(`${key}=`)));
const entries = Object.entries(managed).filter(([, v]) => v !== undefined);
const next = [header, ...entries.map(([k, v]) => `${k}=${v}`), ...kept, ""].join("\n");
// Unchanged files are not rewritten, so the dev server does not reload its environment.
if (next !== previous) writeFileSync(path, next);

console.log(`Local Supabase: API ${local.url}`);
console.log(`  Studio ${local.studio}  |  Mailpit ${local.mailpit}`);
console.log(
  delivery === "mailpit"
    ? "  Auth email goes to Mailpit, not real inboxes."
    : `  Auth email is delivered for real through ${delivery}.`,
);
