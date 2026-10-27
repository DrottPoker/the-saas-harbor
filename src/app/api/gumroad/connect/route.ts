import type { NextRequest } from "next/server";
import { gumroadOAuth } from "@/lib/revenue/gumroad/oauth";
import { startOAuth } from "@/lib/revenue/oauth-routes";

// Starts connecting Gumroad to a product the signed-in founder owns (`startOAuth`).
export async function GET(request: NextRequest) {
  return startOAuth(request, gumroadOAuth);
}
