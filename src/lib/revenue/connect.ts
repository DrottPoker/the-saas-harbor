import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookieOptions } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/types";
import { otherProviderSchema } from "@/lib/domain";
import {
  CHOOSE_PROVIDER,
  connectsWithOAuth,
  isProviderId,
  providerExtra,
  PROVIDERS,
  type ProviderId,
} from "./catalog";
import {
  CONNECTION_RESULT_COOKIE,
  CONNECTION_RESULT_SECONDS,
  encodeConnectionResult,
  type ConnectionResult,
} from "./connection-result";
import { VerificationError } from "./errors";
import { gumroadOAuth } from "./gumroad/oauth";
import { mercadopagoOAuth } from "./mercadopago/oauth";
import { adapter } from "./providers";
import { allowTestKeys } from "./sync";
import type { ParsedKey } from "./types";
import { zohoOAuth } from "./zoho/oauth";

/** The providers connected through OAuth that this server is set up for. */
export function oauthReadyProviders(): ProviderId[] {
  return [gumroadOAuth, zohoOAuth, mercadopagoOAuth]
    .filter((provider) => provider.client())
    .map((provider) => provider.id);
}

// Every check, successful or not, counts against the limits in begin_revenue_check: a refresh at
// most every five minutes per product, and 20 checks an hour per maker.
export async function beginRevenueCheck(
  client: SupabaseClient<Database>,
  saasId: string,
  refresh: boolean,
) {
  const { error } = await client.rpc("begin_revenue_check", { p_saas: saasId, p_refresh: refresh });
  if (error?.code === "P0001") throw new VerificationError(`${error.message}.`);
  if (error) throw new Error(`The revenue check could not start: ${error.message}`);
}

/**
 * The payment provider chosen in the product form: a supported one with the key pasted for it, or
 * Other with the name the founder wrote. Null when none was chosen, which only a product that is
 * connected already may leave. A provider connected through OAuth has no key: its approval starts
 * after the save. Checked before the product is saved, so a key in the wrong form saves nothing.
 */
export type ChosenConnection = { provider: ProviderId; key: ParsedKey | null };
export type ChosenProvider = ChosenConnection | { provider: "other"; name: string };

export function chosenProvider(form: FormData): ChosenProvider | null {
  const provider = form.get("provider");
  if (provider === null || provider === "") return null;
  if (provider === "other") {
    const name = otherProviderSchema.safeParse(String(form.get("other_provider") ?? ""));
    if (!name.success) throw new VerificationError(name.error.issues[0]!.message);
    return { provider, name: name.data };
  }
  if (!isProviderId(provider)) throw new VerificationError(CHOOSE_PROVIDER);
  if (connectsWithOAuth(provider)) {
    if (!oauthReadyProviders().includes(provider))
      throw new VerificationError(`${PROVIDERS[provider].name} is not set up on this server yet.`);
    return { provider, key: null };
  }
  const key = adapter(provider).parseKey(
    {
      key: String(form.get("provider_key") ?? ""),
      account: String(form.get("provider_account") ?? ""),
      extra: providerExtra(provider).map((_, index) =>
        String(form.get(`provider_extra_${index + 1}`) ?? ""),
      ),
    },
    { allowTest: allowTestKeys() },
  );
  return { provider, key };
}

/** Keeps how connecting went for the product's editor, which shows it once it is opened. */
export async function keepConnectionResult(result: Omit<ConnectionResult, "at">) {
  (await cookies()).set(
    CONNECTION_RESULT_COOKIE,
    encodeConnectionResult({ ...result, at: Date.now() }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieOptions.secure,
      maxAge: CONNECTION_RESULT_SECONDS,
      path: "/dashboard",
    },
  );
}
