import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { parseEnv } from "node:util";

// npm run auth:production
// Pushes the Auth settings in supabase/config.toml to production, with the [remotes.production]
// overrides, Resend as SMTP and, once their client IDs are set, sign-in with Google and GitHub.
// The Resend API key and the provider secrets are typed here, hidden, and passed only to the
// Supabase CLI's environment, never written to a file. `supabase config push` does not ask before
// it pushes, so this script asks instead.
const PROJECT = "vgwgeennghaqpvfsqewq";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

let linked = "";
try {
  linked = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
} catch {
  // Not linked on this machine.
}
if (linked !== PROJECT)
  throw new Error(`Link production first: npx supabase link --project-ref ${PROJECT}`);
if (!process.stdin.isTTY)
  throw new Error("Run this in a terminal, so the key can be typed hidden.");

function ask(question) {
  const lines = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    lines.question(question, (answer) => (lines.close(), resolve(answer))),
  );
}

function askHidden(question) {
  process.stdout.write(question);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve) => {
    let value = "";
    const onData = (chunk) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\r" || char === "\n") {
          process.stdin.off("data", onData);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write("\n");
          return resolve(value);
        }
        if (char === "\u0003") process.exit(130);
        value = char === "\u007f" || char === "\b" ? value.slice(0, -1) : value + char;
      }
    };
    process.stdin.on("data", onData);
  });
}

const key = (await askHidden("Resend API key for Supabase Auth (re_...): ")).trim();
if (!/^re_[A-Za-z0-9_]{10,}$/.test(key))
  throw new Error("That does not look like a Resend API key.");

// Sign-in with Google and GitHub is on once the provider's public client ID is committed in
// supabase/.env. Its secret is typed here like the Resend key.
const committed = parseEnv(readFileSync(new URL("../supabase/.env", import.meta.url), "utf8"));
const providers = [
  {
    name: "Google",
    env: "GOOGLE",
    clientId: /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/,
    secret: /^GOCSPX-[A-Za-z0-9_-]{10,}$/,
    secretHint: "GOCSPX-...",
  },
  {
    name: "GitHub",
    env: "GITHUB",
    clientId: /^[A-Za-z0-9]{20}$/,
    secret: /^[0-9a-f]{40}$/,
    secretHint: "40 hexadecimal characters",
  },
];
const oauthEnv = {};
const oauthSummary = [];
for (const provider of providers) {
  const variable = `HARBOR_PRODUCTION_${provider.env}_CLIENT_ID`;
  const clientId = committed[variable] ?? "";
  if (clientId && !provider.clientId.test(clientId))
    throw new Error(`${variable} in supabase/.env is not a ${provider.name} client ID.`);
  const secret = clientId
    ? (await askHidden(`${provider.name} OAuth client secret (${provider.secretHint}): `)).trim()
    : "";
  if (clientId && !provider.secret.test(secret))
    throw new Error(`That does not look like a ${provider.name} OAuth client secret.`);
  oauthEnv[`HARBOR_PRODUCTION_${provider.env}_ENABLED`] = clientId ? "true" : "false";
  oauthEnv[variable] = clientId;
  oauthEnv[`HARBOR_PRODUCTION_${provider.env}_SECRET`] = secret;
  oauthSummary.push(
    clientId
      ? `  Sign-in with ${provider.name} on, with the client ${clientId}.`
      : `  Sign-in with ${provider.name} off (no ${variable} in supabase/.env).`,
  );
}

console.log(
  [
    "",
    `This pushes supabase/config.toml to the production project ${PROJECT}:`,
    "  site URL https://thesaasharbor.com, the confirm and sign-in callback pages as redirect URLs,",
    "  the email templates and subjects, 60 seconds between emails to one address,",
    "  and Auth email through smtp.resend.com as The SaaS Harbor <noreply@thesaasharbor.com>.",
    ...oauthSummary,
    "",
  ].join("\n"),
);
if ((await ask("Push now? Type yes: ")).trim() !== "yes") {
  console.log("Nothing was pushed.");
  process.exit(0);
}

const result = spawnSync(npx, ["supabase", "config", "push"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    // The per-machine settings in supabase/.env.local must not apply; the CLI keeps these.
    HARBOR_SMTP_ENABLED: "false",
    HARBOR_SMTP_USER: "",
    HARBOR_SMTP_PASS: "",
    HARBOR_PRODUCTION_SMTP_ENABLED: "true",
    HARBOR_PRODUCTION_SMTP_HOST: "smtp.resend.com",
    HARBOR_PRODUCTION_SMTP_PORT: "465",
    HARBOR_PRODUCTION_SMTP_USER: "resend",
    HARBOR_PRODUCTION_SMTP_PASS: key,
    HARBOR_PRODUCTION_SMTP_ADMIN_EMAIL: "noreply@thesaasharbor.com",
    HARBOR_PRODUCTION_SMTP_SENDER_NAME: "The SaaS Harbor",
    ...oauthEnv,
  },
});
process.exit(result.status ?? 1);
