import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
if (existsSync(".env.local")) loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Supabase public configuration is missing.");
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
for (const table of ["public_saas", "leaderboard"]) {
  const { error } = await client.from(table).select("id", { head: true });
  if (error) throw new Error(`Public read failed for ${table}: ${error.code}`);
}
const { error } = await client.from("metric_reports").select("id").limit(1);
if (!["42501", "PGRST205"].includes(error?.code ?? ""))
  throw new Error("Anonymous metric history access was not rejected as expected.");
const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
if (!response.ok) throw new Error("Auth settings are unreachable.");
const settings = await response.json();
console.log(
  JSON.stringify(
    {
      publicReads: "passed",
      privateHistory: "access denied as expected",
      emailSignupEnabled: settings.external?.email === true && !settings.disable_signup,
      emailConfirmationRequired: !settings.mailer_autoconfirm,
      note: "Email delivery and redirect allowlists need a separate account-level check.",
    },
    null,
    2,
  ),
);
