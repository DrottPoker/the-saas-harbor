import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, createNonce } from "@/lib/csp";
import { cookieOptions, supabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/types";

const PUBLIC_PAGE = /^\/(saas|users)\/([^/]+)$/;
// A public page's address with .md added serves its Markdown version (llmstxt.org).
const MARKDOWN_PAGE = /^\/(saas|users)\/([^/]+)\.md$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Product and maker pages moved from ids to readable addresses. Links with an id or capital
// letters get a permanent redirect here, before rendering: a page that streams could only redirect
// in the browser. Only these addresses cost a lookup, and it reads what a visitor may see.
async function movedAddress(request: NextRequest, config: ReturnType<typeof supabaseConfig>) {
  const match = request.nextUrl.pathname.match(PUBLIC_PAGE);
  if (!match) return null;
  const [, kind, address] = match;
  let slug: string | null = null;
  if (UUID.test(address) && config) {
    const client = createClient<Database>(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const id = address.toLowerCase();
    const { data } =
      kind === "saas"
        ? await client.from("public_saas").select("slug").eq("id", id).maybeSingle()
        : await client.from("profiles").select("slug").eq("id", id).maybeSingle();
    slug = data?.slug ?? null;
  } else if (address !== address.toLowerCase()) {
    slug = address.toLowerCase();
  }
  if (!slug) return null;
  const url = request.nextUrl.clone();
  url.pathname = `/${kind}/${slug}`;
  return url;
}

export async function proxy(request: NextRequest) {
  const markdown = request.nextUrl.pathname.match(MARKDOWN_PAGE);
  if (markdown) {
    // The route answers ids, earlier slugs and capital letters with a redirect of its own.
    const url = request.nextUrl.clone();
    url.pathname = `/md/${markdown[1]}/${markdown[2]}`;
    return NextResponse.rewrite(url);
  }
  const config = supabaseConfig();
  const moved = await movedAddress(request, config);
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
  // refreshed below reach the page too.
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    const response = NextResponse.next({ request: { headers } });
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
// The icons, the logo and embedded badges carry their own headers and need no session.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico$|icon\\.svg$|apple-icon$|logo\\.png$|saas/[^/]+/badge\\.svg$).*)",
  ],
};
