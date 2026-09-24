import { execFileSync } from "node:child_process";

export const npx = process.platform === "win32" ? "npx.cmd" : "npx";
export const shell = process.platform === "win32";

// Reads the local stack's URLs and keys without printing them. Never returns hosted values.
export function localSupabase() {
  let status;
  try {
    status = JSON.parse(
      execFileSync(npx, ["supabase", "status", "--output", "json"], {
        encoding: "utf8",
        shell,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  } catch {
    throw new Error(
      "Start local Supabase first with `npm run db:start`. No hosted credentials are used.",
    );
  }
  const url = status.API_URL;
  const mailpit = status.MAILPIT_URL || status.INBUCKET_URL;
  for (const local of [url, mailpit]) {
    if (!local || new URL(local).hostname !== "127.0.0.1")
      throw new Error("Local Supabase and Mailpit must run at 127.0.0.1.");
  }
  return {
    url,
    mailpit,
    publishableKey: status.PUBLISHABLE_KEY || status.ANON_KEY,
    secretKey: status.SERVICE_ROLE_KEY || status.SECRET_KEY,
  };
}
