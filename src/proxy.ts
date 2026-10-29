import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, userAgent, type NextRequest } from "next/server";
import {
  DEFAULT_LOCALE,
  isLocale,
  isLocalizedPath,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  localizedPath,
  splitLocale,
  type Locale,
} from "@/i18n/config";
import { negotiateLocale } from "@/i18n/detect";
import { contentSecurityPolicy, createNonce } from "@/lib/csp";
import { cookieOptions, supabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/types";

const PUBLIC_PAGE = /^\/(saas|users)\/([^/]+)$/;
// A public page's address with .md added serves its Markdown version (llmstxt.org).
const MARKDOWN_PAGE = /^\/(saas|users)\/([^/]+)\.md$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// next dev and next start run the proxy again for a rewrite's destination, with the headers the
// first run set. That run would take /es/browse for the English /browse, so the first marks the
// request for that destination with a value only this process knows. Server Action redirects
// forward the headers too, so a different destination must pass through the proxy again.
const PASS_HEADER = "x-harbor-proxy";
const PASS = crypto.randomUUID();
const passFor = (path: string) => `${PASS}:${path}`;

// Product and maker pages moved from ids to readable addresses. Links with an id or capital
// letters get a permanent redirect here, before rendering: a page that streams could only redirect
// in the browser. Only these addresses cost a lookup, and it reads what a visitor may see.
async function movedAddress(
  request: NextRequest,
  path: string,
  locale: Locale,
  config: ReturnType<typeof supabaseConfig>,
) {
  const match = path.match(PUBLIC_PAGE);
  if (!match) return null;
  const [, kind, address] = match;
  let slug: string | null = null;
  if (UUID.test(address) && config) {
    const client = createClient<Database>(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const id = address.toLowerCase();
    // A product's name, and so its slug, can look like an id; the page with that slug wins.
    const either = `slug.eq.${id},id.eq.${id}`;
    const { data } =
      kind === "saas"
        ? await client.from("public_saas").select("id, slug").or(either).limit(2)
        : await client.from("profiles").select("id, slug").or(either).limit(2);
    const rows: { id: string | null; slug: string | null }[] = data ?? [];
    slug = (rows.find((row) => row.slug === id) ?? rows.find((row) => row.id === id))?.slug ?? null;
  } else if (address !== address.toLowerCase()) {
    slug = address.toLowerCase();
  }
  // Never to the address itself, which would loop.
  if (!slug || slug === address) return null;
  const url = request.nextUrl.clone();
  url.pathname = localizedPath(locale, `/${kind}/${slug}`);
  return url;
}

/**
 * The language to send a visitor to from an English address: their own choice from the menu, else
 * on a first visit the browser's languages. Crawlers stay on the address they asked for, which
 * names its other languages with hreflang.
 */
function preferredLocale(request: NextRequest): Locale {
  const chosen = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  if (userAgent(request).isBot) return DEFAULT_LOCALE;
  return negotiateLocale(request.headers.get("accept-language"));
}

function redirectTo(url: URL, status: 307 | 308) {
  const redirect = NextResponse.redirect(url, status);
  redirect.headers.set("Cache-Control", "private, no-store");
  redirect.headers.set("Vary", "Cookie, Accept-Language");
  return redirect;
}

export async function proxy(request: NextRequest) {
  if (request.headers.get(PASS_HEADER) === passFor(request.nextUrl.pathname))
    return NextResponse.next();
  const markdown = request.nextUrl.pathname.match(MARKDOWN_PAGE);
  if (markdown) {
    // The route answers ids, earlier slugs and capital letters with a redirect of its own.
    const url = request.nextUrl.clone();
    url.pathname = `/md/${markdown[1]}/${markdown[2]}`;
    return NextResponse.rewrite(url);
  }
  // Other languages live under /<locale>; English keeps the addresses it always had.
  const { locale: prefix, path } = splitLocale(request.nextUrl.pathname);
  if (prefix && path === "/sitemap.xml") {
    // Each language has its own sitemap, drawn by the same route.
    const url = request.nextUrl.clone();
    url.pathname = path;
    const headers = new Headers(request.headers);
    headers.set(LOCALE_HEADER, prefix);
    headers.set(PASS_HEADER, passFor(path));
    return NextResponse.rewrite(url, { request: { headers } });
  }
  if (prefix === DEFAULT_LOCALE || (prefix && !isLocalizedPath(path))) {
    // /en/... and files under a prefix have one address only.
    const url = request.nextUrl.clone();
    url.pathname = path;
    return redirectTo(url, 308);
  }
  // Next may resolve an action redirect to the rewrite's bare destination before rendering it
  // again. Only headers marked by this process may retain the original page's language there.
  const forwarded = request.headers.get(PASS_HEADER)?.startsWith(`${PASS}:`) === true;
  const forwardedLocale = request.headers.get(LOCALE_HEADER);
  const locale =
    prefix ??
    (forwarded && isLocalizedPath(path) && isLocale(forwardedLocale)
      ? forwardedLocale
      : DEFAULT_LOCALE);
  if (
    !prefix &&
    !forwarded &&
    (request.method === "GET" || request.method === "HEAD") &&
    isLocalizedPath(path)
  ) {
    const wanted = preferredLocale(request);
    if (wanted !== DEFAULT_LOCALE) {
      const url = request.nextUrl.clone();
      url.pathname = localizedPath(wanted, path);
      return redirectTo(url, 307);
    }
  }
  const config = supabaseConfig();
  const moved = await movedAddress(request, path, locale, config);
  if (moved) {
    // Not cached: a maker's slug follows their name, so an id may point elsewhere later.
    const redirect = NextResponse.redirect(moved, 308);
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }
  const nonce = createNonce();
  const csp = contentSecurityPolicy({
    nonce,
    supabaseUrl: config?.url ?? null,
    development: process.env.NODE_ENV === "development",
    https: (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://"),
  });
  // Next.js reads the nonce from the request's policy and puts it on its own scripts; the root
  // layout reads x-nonce for the theme script. Built from the current request headers, so cookies
  // refreshed below reach the page too. A page in another language is the English route, told its
  // language by a header that the visitor cannot set themselves.
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    headers.set(LOCALE_HEADER, locale);
    headers.set(PASS_HEADER, passFor(path));
    let response: NextResponse;
    if (prefix) {
      const url = request.nextUrl.clone();
      url.pathname = path;
      response = NextResponse.rewrite(url, { request: { headers } });
    } else {
      response = NextResponse.next({ request: { headers } });
    }
    response.headers.set("Content-Security-Policy", csp);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  let response = next();
  if (!config) return response;
  const client = createServerClient(config.url, config.key, {
    cookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = next();
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await client.auth.getClaims();
  return response;
}
// Only pages need the policy and a refreshed session. API routes (the scheduled jobs among them),
// the admin statistics' data, the files for crawlers, sharing images, icons and embedded badges
// skip the proxy, so each of their requests costs one function run instead of two. Routes that
// read the session refresh it themselves. /saas/<slug>.md still passes, for its rewrite.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/|md/|admin/analytics/data$|favicon\\.ico$|icon$|icon1\\.svg$|apple-icon$|logo\\.png$|robots\\.txt$|sitemap\\.xml$|llms\\.txt$|indexnow\\.txt$|opengraph-image$|stats/opengraph-image$|(?:saas|users)/[^/]+/opengraph-image$|saas/[^/]+/milestones/[^/]+/opengraph-image$|saas/[^/]+/badge\\.svg$).*)",
  ],
};
