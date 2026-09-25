// The Content Security Policy. Pure, so it is unit-tested; the proxy sets it on every response with
// a fresh nonce, and Next.js puts the same nonce on its own scripts.

/** A random nonce: 16 bytes, base64. */
export function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function contentSecurityPolicy({
  nonce,
  supabaseUrl,
  development,
  https,
}: {
  nonce: string;
  /** Images come from Supabase Storage, and the browser reads messages and Realtime events. */
  supabaseUrl: string | null;
  /** React needs eval in development only, to rebuild server error stacks in the browser. */
  development: boolean;
  /** Upgrading requests only makes sense when the site itself is served over https. */
  https: boolean;
}) {
  const supabase = supabaseUrl ? new URL(supabaseUrl).origin : null;
  // Realtime connects with a websocket to the same host, which an http source does not cover.
  const backend = supabase ? [supabase, supabase.replace(/^http/, "ws")] : [];
  const directives: string[][] = [
    ["default-src", "'self'"],
    ["script-src", "'self'", `'nonce-${nonce}'`, "'strict-dynamic'"].concat(
      development ? ["'unsafe-eval'"] : [],
    ),
    // Inline style attributes come from React style props. A nonce cannot cover attributes, and
    // style-src-attr is not in every supported browser, so styles stay open to inline use.
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "blob:", "data:", ...backend.slice(0, 1)],
    ["font-src", "'self'"],
    ["connect-src", "'self'", ...backend],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
  ];
  if (https) directives.push(["upgrade-insecure-requests"]);
  return directives.map((directive) => directive.join(" ")).join("; ");
}
