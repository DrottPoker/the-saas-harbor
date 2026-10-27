import type { NextRequest } from "next/server";
import { startOAuth } from "@/lib/revenue/oauth-routes";
import { zohoOAuth } from "@/lib/revenue/zoho/oauth";

// Starts connecting Zoho Billing to a product the signed-in founder owns (`startOAuth`).
export async function GET(request: NextRequest) {
  return startOAuth(request, zohoOAuth);
}
