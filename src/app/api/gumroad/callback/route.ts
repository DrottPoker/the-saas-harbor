import type { NextRequest } from "next/server";
import { gumroadOAuth } from "@/lib/revenue/gumroad/oauth";
import { finishOAuth } from "@/lib/revenue/oauth-routes";

// Gumroad sends the founder back here once they approve read access to their sales
// (`finishOAuth`). This address is registered with Gumroad.
export async function GET(request: NextRequest) {
  return finishOAuth(request, gumroadOAuth);
}
