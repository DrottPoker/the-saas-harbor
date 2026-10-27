import type { NextRequest } from "next/server";
import { mercadopagoOAuth } from "@/lib/revenue/mercadopago/oauth";
import { finishOAuth } from "@/lib/revenue/oauth-routes";

// Mercado Pago sends the founder back here once they approve read access (`finishOAuth`). This
// address is registered with the site's application on Mercado Pago.
export async function GET(request: NextRequest) {
  return finishOAuth(request, mercadopagoOAuth);
}
