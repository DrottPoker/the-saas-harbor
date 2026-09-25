import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
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
