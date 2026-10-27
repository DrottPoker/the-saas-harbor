import type { NextRequest } from "next/server";
import { mercadopagoOAuth } from "@/lib/revenue/mercadopago/oauth";
import { startOAuth } from "@/lib/revenue/oauth-routes";

// Starts connecting Mercado Pago to a product the signed-in founder owns (`startOAuth`).
export async function GET(request: NextRequest) {
  return startOAuth(request, mercadopagoOAuth);
}
