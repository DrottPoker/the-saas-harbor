import type { NextRequest } from "next/server";
import { finishOAuth } from "@/lib/revenue/oauth-routes";
import { zohoOAuth } from "@/lib/revenue/zoho/oauth";

// Zoho sends the founder back here once they approve read access, with the data centre their
// account is in (`finishOAuth`). This address is registered with Zoho's API console.
export async function GET(request: NextRequest) {
  return finishOAuth(request, zohoOAuth);
}
