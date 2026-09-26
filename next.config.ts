import type { NextConfig } from "next";

// The public origin. In production every other host, such as the project's vercel.app address,
// redirects to it, so search engines find one copy of the site. The API answers on any host, so the
// scheduled jobs keep working whichever address they call.
const site = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : null;
const otherHosts =
  process.env.VERCEL_ENV === "production" && site
    ? [
        {
          source: "/:path((?!api/).*)",
          missing: [{ type: "host" as const, value: site.hostname.replace(/\./g, "\\.") }],
          destination: `${site.origin}/:path`,
          permanent: true,
        },
      ]
    : [];

const config: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // Metadata goes in the head of every response, for crawlers that read the HTML without running
  // JavaScript (AI assistants among them). Public pages are not streamed, so nothing waits longer.
  htmlLimitedBots: /.*/,
  async redirects() {
    return [
      ...otherHosts,
      // Profiles moved from /makers to /users: everyone is a user, and the founder of the products
      // they own.
      { source: "/makers/:path*", destination: "/users/:path*", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Browsers ignore it over plain http, so it only takes effect behind https. Subdomains
          // are left out: they may belong to other services of the operator.
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000" }]
            : []),
        ],
      },
    ];
  },
};
export default config;
