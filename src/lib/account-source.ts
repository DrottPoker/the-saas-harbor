import "server-only";
import { headers } from "next/headers";
import { clientAddress } from "./analytics";
import { adminClient } from "./supabase/admin";

/**
 * Gives a new account the source of the visit that led to it, from the site statistics: the
 * database matches this request's address and browser to today's visits, as it does for page
 * views, and keeps the linking site, campaign tags and first page with the account (migration
 * 20260927160000). Neither the address nor the browser is stored, and a failure never stops a
 * sign-up.
 */
export async function recordAccountSource(userId: string) {
  try {
    const request = await headers();
    const { error } = await adminClient().rpc("record_account_source", {
      p_user: userId,
      p_ip: clientAddress(request),
      p_user_agent: request.get("user-agent") ?? "",
    });
    if (error) console.error("The source of a new account could not be recorded:", error.code);
  } catch {
    console.error("The source of a new account could not be recorded.");
  }
}
