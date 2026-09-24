import { spawn } from "node:child_process";
import { localSupabase, npx, shell } from "./local-supabase.mjs";

// Runs the dev server against the local Supabase stack instead of the hosted project.
const local = localSupabase();
const child = spawn(npx, ["next", "dev", "--hostname", "127.0.0.1", "--port", "3001"], {
  shell,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: local.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.publishableKey,
    NEXT_PUBLIC_SITE_URL: "http://localhost:3001",
    NEXT_DIST_DIR: ".next-local",
  },
});
child.on("exit", (code) => process.exit(code ?? 1));
