import { execFileSync } from "node:child_process";

export const npx = process.platform === "win32" ? "npx.cmd" : "npx";
export const shell = process.platform === "win32";

function status() {
  try {
    return JSON.parse(
      execFileSync(npx, ["supabase", "status", "--output", "json"], {
        encoding: "utf8",
        shell,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  } catch {
    return null;
  }
}

function describe(value) {
  const url = value.API_URL;
  const mailpit = value.MAILPIT_URL || value.INBUCKET_URL;
  for (const local of [url, mailpit]) {
    if (!local || new URL(local).hostname !== "127.0.0.1")
      throw new Error("Local Supabase and Mailpit must run at 127.0.0.1.");
  }
  return {
    url,
    mailpit,
    studio: value.STUDIO_URL,
    publishableKey: value.PUBLISHABLE_KEY || value.ANON_KEY,
    secretKey: value.SERVICE_ROLE_KEY || value.SECRET_KEY,
  };
}

// Reads the local stack's URLs and keys without printing them. Never returns remote values.
export function localSupabase() {
  const value = status();
  if (!value)
    throw new Error("Start local Supabase first with `npm run db:start` (Docker must be running).");
  return describe(value);
}

// Like localSupabase(), but starts the stack first when it is not running.
export function ensureLocalSupabase() {
  if (!status()) {
    console.log("Starting local Supabase. The first start downloads Docker images...");
    try {
      execFileSync(npx, ["supabase", "start"], { shell, stdio: ["ignore", "ignore", "inherit"] });
    } catch {
      throw new Error("Local Supabase could not start. Make sure Docker Desktop is running.");
    }
  }
  return localSupabase();
}
