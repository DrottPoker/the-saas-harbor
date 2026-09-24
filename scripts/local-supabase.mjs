import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export const npx = process.platform === "win32" ? "npx.cmd" : "npx";
export const shell = process.platform === "win32";

const projectId = readFileSync("supabase/config.toml", "utf8").match(
  /^project_id\s*=\s*"([^"]+)"/m,
)?.[1];

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

// Where the running Auth container sends email: "mailpit", or the real SMTP host.
export function emailDelivery() {
  const env = execFileSync(
    "docker",
    [
      "inspect",
      `supabase_auth_${projectId}`,
      "--format",
      "{{range .Config.Env}}{{println .}}{{end}}",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const host = env.match(/^GOTRUE_SMTP_HOST=(.*)$/m)?.[1] ?? "";
  return host.startsWith("supabase_inbucket_") ? "mailpit" : host;
}

// Starts the stack. Real email is used only when supabase/.env.local enables it with a password;
// `mailpit: true` forces the local inbox, which the browser tests need.
export function startLocalSupabase({ mailpit = false } = {}) {
  const local = existsSync("supabase/.env.local")
    ? parseEnv(readFileSync("supabase/.env.local", "utf8"))
    : {};
  const env = { ...process.env };
  if (local.HARBOR_SMTP_ENABLED === "true" && !local.HARBOR_SMTP_PASS && !mailpit)
    console.warn("Real email is enabled in supabase/.env.local but HARBOR_SMTP_PASS is empty.");
  if (mailpit || !local.HARBOR_SMTP_PASS) env.HARBOR_SMTP_ENABLED = "false";
  console.log("Starting local Supabase. The first start downloads Docker images...");
  // The CLI stops the stack when a start fails, for example when a container misses its health
  // check right after a restart, so one retry begins from a clean state.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const failure = runStart(env);
    if (failure === null) return;
    if (failure) console.error(failure);
    if (attempt === 1) console.log("Local Supabase did not start. Retrying once...");
  }
  throw new Error("Local Supabase could not start. Make sure Docker Desktop is running.");
}

// Lines that may carry credentials are never shown.
const SENSITIVE = /key|secret|jwt|token|pass|smtp/i;

// Returns null on success, otherwise the safe part of the CLI output. Standard output lists the
// local keys after a successful start, so it is never printed as a whole.
function runStart(env) {
  try {
    execFileSync(npx, ["supabase", "start"], {
      shell,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
    return null;
  } catch (error) {
    return String(error.stdout ?? "")
      .split("\n")
      .filter((line) => line.trim() && !SENSITIVE.test(line))
      .join("\n");
  }
}

export function stopLocalSupabase() {
  execFileSync(npx, ["supabase", "stop"], { shell, stdio: ["ignore", "ignore", "inherit"] });
}

// Like localSupabase(), but starts the stack first when it is not running.
export function ensureLocalSupabase() {
  if (!status()) startLocalSupabase();
  return localSupabase();
}
