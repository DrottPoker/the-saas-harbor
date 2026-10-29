import "server-only";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  localizedPath,
  splitLocale,
  type Locale,
} from "@/i18n/config";
import { negotiateLocale } from "@/i18n/detect";
import { sendQueuedEmails } from "@/lib/email/outbox";
import { siteUrl } from "@/lib/seo";
import { cookieOptions } from "@/lib/supabase/config";
import { requireUser } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { providerName } from "./catalog";
import { beginRevenueCheck, keepConnectionResult } from "./connect";
import { connectionResultPath, type ConnectionResult } from "./connection-result";
import { localizedMakerMessage, VerificationError } from "./errors";
import {
  decodeOAuthFlow,
  encodeOAuthFlow,
  newOAuthFlow,
  OAUTH_FLOW_SECONDS,
  oauthFlowCookie,
  type OAuthProvider,
} from "./oauth";
import { connectedSummary } from "./summary";
import { allowTestKeys, connectProvider } from "./sync";

// The connect and callback routes of every provider connected through OAuth (see `oauth.ts`).
// They live apart from `oauth.ts` because they use `connect.ts` and `sync.ts`, which import the
// providers' own modules; the providers import `oauth.ts`, so keeping the two apart avoids a cycle.
// The routes are outside the language addresses, so the founder's language travels with the flow:
// the answer is written in it and the editor is opened in it.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toSite = (path: string, locale: Locale = DEFAULT_LOCALE) =>
  NextResponse.redirect(new URL(localizedPath(locale, path), siteUrl()));

async function owns(client: SupabaseClient<Database>, saasId: string, userId: string) {
  const { data } = await client
    .from("saas")
    .select("id")
    .eq("id", saasId)
    .eq("owner_id", userId)
    .maybeSingle();
  return !!data;
}

/** The path of the page on this site that sent the founder here, if the browser says. */
function refererPath(request: NextRequest) {
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    const url = new URL(referer);
    const own = [request.nextUrl.origin, new URL(siteUrl()).origin];
    return own.includes(url.origin) ? url.pathname : null;
  } catch {
    return null;
  }
}

/**
 * The language the founder started in: the one the product form names (`oauthConnectPath`), else
 * the one of the page they came from, else the one the site would choose for them, as the proxy
 * does for an English address.
 */
function startLocale(request: NextRequest): Locale {
  const named = request.nextUrl.searchParams.get("locale");
  if (isLocale(named)) return named;
  const from = refererPath(request);
  if (from !== null) return splitLocale(from).locale ?? DEFAULT_LOCALE;
  const chosen = request.cookies.get(LOCALE_COOKIE)?.value;
  return isLocale(chosen) ? chosen : negotiateLocale(request.headers.get("accept-language"));
}

/**
 * `GET /api/<id>/connect?saas=<id>&locale=<locale>`: starts connecting a provider to a product the
 * signed-in founder owns. The product form saves first and then opens this address rather than
 * redirecting from its action, so the redirect to the provider is a plain navigation, which the
 * form-action policy does not cover. The state, the PKCE verifier and the founder's language wait
 * in a cookie for the callback.
 */
export async function startOAuth(request: NextRequest, provider: OAuthProvider) {
  const saasId = request.nextUrl.searchParams.get("saas") ?? "";
  const locale = startLocale(request);
  const { user, client } = await requireUser();
  if (!UUID.test(saasId) || !(await owns(client, saasId, user.id)))
    return toSite("/dashboard", locale);
  const app = provider.client();
  if (!app) {
    const t = await getTranslations({ locale, namespace: "providers" });
    await keepConnectionResult(
      {
        saasId,
        provider: provider.id,
        tone: "error",
        text: t("notSetUp", { provider: providerName(provider.id) }),
      },
      locale,
    );
    return toSite(connectionResultPath(saasId), locale);
  }
  const flow = newOAuthFlow(saasId, user.id, locale);
  const { name, path } = oauthFlowCookie(provider.id);
  (await cookies()).set(name, encodeOAuthFlow(flow), {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieOptions.secure,
    maxAge: OAUTH_FLOW_SECONDS,
    path,
  });
  return NextResponse.redirect(provider.authorizeUrl(app, flow));
}

/**
 * `GET /api/<id>/callback`: the provider sends the founder back here with a code once they approve
 * read access. The code is exchanged only for the founder who started, with the state they started
 * with, and for a product they own. What the exchange returns is verified like any other key before
 * it is stored, and the outcome waits in a cookie for the product's editor, in the language the
 * founder started in. Redirects go to the site's own address, which the provider returned to, so
 * the session cookie goes along.
 */
export async function finishOAuth(request: NextRequest, provider: OAuthProvider) {
  const name = providerName(provider.id);
  const jar = await cookies();
  const cookie = oauthFlowCookie(provider.id);
  const flow = decodeOAuthFlow(jar.get(cookie.name)?.value);
  jar.delete(cookie);
  if (!flow || !UUID.test(flow.saasId)) return toSite("/dashboard");
  const { locale } = flow;
  const [t, providers] = await Promise.all([
    getTranslations({ locale, namespace: "revenue.result" }),
    getTranslations({ locale, namespace: "providers" }),
  ]);
  const finish = async (tone: ConnectionResult["tone"], text: string) => {
    await keepConnectionResult({ saasId: flow.saasId, provider: provider.id, tone, text }, locale);
    return toSite(connectionResultPath(flow.saasId), locale);
  };
  try {
    const { user, client } = await requireUser();
    if (user.id !== flow.userId) return toSite("/dashboard", locale);
    const params = request.nextUrl.searchParams;
    if (params.get("state") !== flow.state)
      return await finish("error", t("expired", { provider: name }));
    if (params.get("error")) return await finish("error", t("denied", { provider: name }));
    const code = params.get("code");
    if (!code) return await finish("error", t("incomplete", { provider: name }));
    const app = provider.client();
    if (!app) return await finish("error", providers("notSetUp", { provider: name }));
    if (!(await owns(client, flow.saasId, user.id)))
      throw new VerificationError("check.ownSaasOnly");
    // Counts against the same limits as any check a founder starts.
    await beginRevenueCheck(client, flow.saasId, false);
    const key = await provider.exchange(app, {
      code,
      verifier: flow.verifier,
      params,
      allowTest: allowTestKeys(),
    });
    const result = await connectProvider(flow.saasId, provider.id, key);
    // A verification may reach a milestone, which queues an email.
    sendQueuedEmails();
    revalidatePath("/", "layout");
    return await finish("success", await connectedSummary(result, locale));
  } catch (error) {
    unstable_rethrow(error);
    return await finish("error", await localizedMakerMessage(error, locale));
  }
}
