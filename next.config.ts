import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // The screenshot route runs @sparticuz/chromium on Vercel, which reads its packed browser from
  // files that tracing does not find on its own.
  outputFileTracingIncludes: {
    "/api/screenshots/capture": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  // @sparticuz/chromium is optional and installs only on Node.js 22.17 or later; where it is
  // missing, the screenshot code never loads it, so the missing module is no problem.
  turbopack: {
    ignoreIssue: [{ path: /screenshots[\\/]capture\.ts$/, title: /Module not found/ }],
  },
  // Profiles moved from /makers to /users: everyone is a user, and the founder of the products they own.
  async redirects() {
    return [{ source: "/makers/:path*", destination: "/users/:path*", permanent: true }];
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
