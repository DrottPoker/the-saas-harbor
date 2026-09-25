import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  emailDelivery,
  ensureLocalSupabase,
  mailpitSmtpPort,
  npx,
  shell,
} from "./local-supabase.mjs";

const local = ensureLocalSupabase();
// The tests read confirmation links from Mailpit and must never email real addresses.
if (emailDelivery() !== "mailpit")
  throw new Error(
    "Local Supabase delivers real email. Run `npm run db:restart -- --mailpit` before the browser tests.",
  );
const testEnv = { ...process.env };
delete testEnv.NO_COLOR;
delete testEnv.FORCE_COLOR;
const fakeStripe = "http://127.0.0.1:3011";
const cronSecret = randomBytes(32).toString("base64");
const result = spawnSync(npx, ["playwright", "test"], {
  shell,
  stdio: "inherit",
  env: {
    ...testEnv,
    TEST_SUPABASE_URL: local.url,
    TEST_SUPABASE_SECRET_KEY: local.secretKey,
    TEST_MAILPIT_URL: local.mailpit,
    TEST_CRON_SECRET: cronSecret,
    NEXT_PUBLIC_SUPABASE_URL: local.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.publishableKey,
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3002",
    NEXT_DIST_DIR: ".next-e2e",
    LOCAL_MAILPIT_URL: local.mailpit,
    // Stripe verification against the fake API, with test-only secrets.
    SUPABASE_SECRET_KEY: local.secretKey,
    STRIPE_KEY_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    CRON_SECRET: cronSecret,
    STRIPE_ALLOW_TEST_KEYS: "true",
    STRIPE_API_BASE: fakeStripe,
    FX_API_BASE: fakeStripe,
    // Notification emails go to Mailpit, and message emails are due at once.
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(mailpitSmtpPort),
    SMTP_USER: "",
    SMTP_PASS: "",
    EMAIL_FROM: "The SaaS Harbor <notifications@harbor.localhost>",
    MESSAGE_EMAIL_DELAY_SECONDS: "0",
  },
});
process.exit(result.status ?? 1);
