import { execFileSync, spawnSync } from "node:child_process";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const options = {
  encoding: "utf8",
  shell: process.platform === "win32",
  stdio: ["ignore", "pipe", "pipe"],
};
let status;
try {
  status = JSON.parse(execFileSync(npx, ["supabase", "status", "--output", "json"], options));
} catch {
  throw new Error(
    "Start local Supabase before running these tests. No hosted credentials are used.",
  );
}
const url = status.API_URL;
const mailpit = status.MAILPIT_URL || status.INBUCKET_URL;
for (const local of [url, mailpit]) {
  if (!local || new URL(local).hostname !== "127.0.0.1")
    throw new Error("Tests require local Supabase and Mailpit at 127.0.0.1.");
}
const testEnv = { ...process.env };
delete testEnv.NO_COLOR;
delete testEnv.FORCE_COLOR;
const result = spawnSync(npx, ["playwright", "test"], {
  shell: process.platform === "win32",
  stdio: "inherit",
  env: {
    ...testEnv,
    TEST_SUPABASE_URL: url,
    TEST_SUPABASE_SECRET_KEY: status.SERVICE_ROLE_KEY || status.SECRET_KEY,
    TEST_MAILPIT_URL: mailpit,
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY || status.ANON_KEY,
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3001",
    NEXT_DIST_DIR: ".next-e2e",
  },
});
process.exit(result.status ?? 1);
