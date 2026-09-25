import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "./local-supabase.mjs";

// npm run admin -- grant <email> | revoke <email> | list
// Admin rights for the local stack. Production runs the same database functions with its own
// service role; see README.
const [command, email] = process.argv.slice(2);
const usage = "Usage: npm run admin -- grant <email> | revoke <email> | list";
const local = localSupabase();
const admin = createClient(local.url, local.secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

if (command === "list") {
  const { data, error } = await admin.rpc("list_admins");
  if (error) throw new Error("Could not list admins. Run `npx supabase migration up --local`.");
  console.log(data.length ? data.map((row) => row.email).join("\n") : "No admins yet.");
} else if ((command === "grant" || command === "revoke") && email) {
  const { error } = await admin.rpc("set_admin", { p_email: email, p_admin: command === "grant" });
  if (error) throw new Error(error.code === "P0002" ? `No account uses ${email}.` : error.message);
  console.log(
    command === "grant" ? `${email} is now an admin.` : `${email} is no longer an admin.`,
  );
} else {
  throw new Error(usage);
}
