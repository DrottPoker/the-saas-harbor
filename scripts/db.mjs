import {
  emailDelivery,
  localSupabase,
  startLocalSupabase,
  stopLocalSupabase,
} from "./local-supabase.mjs";

// npm run db:start | db:restart [-- --mailpit]
const [command] = process.argv.slice(2);
const mailpit = process.argv.includes("--mailpit");

if (command === "restart") stopLocalSupabase();
if (command === "start" || command === "restart") {
  startLocalSupabase({ mailpit });
  const delivery = emailDelivery();
  console.log(
    delivery === "mailpit"
      ? `Auth email: local Mailpit inbox (${localSupabase().mailpit}).`
      : `Auth email: real delivery through ${delivery}.`,
  );
} else {
  throw new Error("Usage: node scripts/db.mjs start|restart [--mailpit]");
}
