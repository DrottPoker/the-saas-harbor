import { spawnSync } from "node:child_process";
import { emailDelivery, ensureLocalSupabase, npx, shell } from "./local-supabase.mjs";

const local = ensureLocalSupabase();
// The tests read confirmation links from Mailpit and must never email real addresses.
if (emailDelivery() !== "mailpit")
  throw new Error(
    "Local Supabase delivers real email. Run `npm run db:restart -- --mailpit` before the browser tests.",
  );
const testEnv = { ...process.env };
delete testEnv.NO_COLOR;
delete testEnv.FORCE_COLOR;
const result = spawnSync(npx, ["playwright", "test"], {
  shell,
  stdio: "inherit",
  env: {
    ...testEnv,
    TEST_SUPABASE_URL: local.url,
    TEST_SUPABASE_SECRET_KEY: local.secretKey,
    TEST_MAILPIT_URL: local.mailpit,
    NEXT_PUBLIC_SUPABASE_URL: local.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.publishableKey,
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3002",
    NEXT_DIST_DIR: ".next-e2e",
  },
});
process.exit(result.status ?? 1);
