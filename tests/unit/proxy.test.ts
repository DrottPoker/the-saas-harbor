import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "../../src/proxy";

const runs = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("proxy matcher", () => {
  it("runs for pages, including products and users named like the files it skips", () => {
    for (const url of [
      "/",
      "/browse?category=Design",
      "/saas/solofy",
      "/saas/opengraph-image",
      "/users/opengraph-image",
      "/users/victor",
      "/dashboard",
      "/auth/callback?code=abc",
      "/admin/analytics",
    ])
      expect(runs(url), url).toBe(true);
  });
  it("runs for a page's Markdown address, which it rewrites", () => {
    expect(runs("/saas/solofy.md")).toBe(true);
    expect(runs("/users/victor.md")).toBe(true);
  });
  it("skips API routes, the admin statistics' data, files for crawlers, sharing images, icons and badges", () => {
    for (const url of [
      "/api/email/send",
      "/api/analytics",
      "/admin/analytics/data?report=live",
      "/md/saas/solofy",
      "/robots.txt",
      "/sitemap.xml",
      "/llms.txt",
      "/indexnow.txt",
      "/opengraph-image?49d8f254e9dec617",
      "/stats/opengraph-image",
      "/saas/solofy/opengraph-image?49d8f254e9dec617",
      "/users/victor/opengraph-image",
      "/saas/solofy/milestones/first-customer/opengraph-image",
      "/saas/solofy/badge.svg",
      "/icon",
      "/apple-icon",
      "/favicon.ico",
      "/logo.png",
    ])
      expect(runs(url), url).toBe(false);
  });
});

// Unit tests have no Supabase settings, so the proxy answers without refreshing a session.
const visit = (path: string, headers: Record<string, string> = {}, method = "GET") =>
  proxy(new NextRequest(`http://localhost${path}`, { headers, method }));
const chrome =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";

describe("addresses in other languages", () => {
  it("skips only a rewrite's destination, and handles a Server Action's forwarded redirect", async () => {
    const first = await visit("/es/auth/confirm", {}, "POST");
    const pass = first.headers.get("x-middleware-request-x-harbor-proxy")!;
    const forwarded = { "x-harbor-proxy": pass, "x-harbor-locale": "es" };
    const destination = await visit("/auth/confirm", forwarded);
    expect(destination.headers.get("x-middleware-next")).toBe("1");
    expect(destination.headers.get("x-middleware-request-x-harbor-locale")).toBeNull();
    const redirected = await visit("/es/dashboard/saas/new", forwarded);
    expect(redirected.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost/dashboard/saas/new",
    );
    expect(redirected.headers.get("x-middleware-request-x-harbor-locale")).toBe("es");
    const resolved = await visit("/dashboard/saas/new", forwarded);
    expect(resolved.headers.get("x-middleware-request-x-harbor-locale")).toBe("es");
    expect(resolved.headers.get("location")).toBeNull();
    const shared = await visit("/admin", forwarded);
    expect(shared.headers.get("x-middleware-request-x-harbor-locale")).toBe("en");
  });
  it("serve the English route with the language as a header", async () => {
    const response = await visit("/es/browse?category=Design");
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost/browse?category=Design",
    );
    expect(response.headers.get("x-middleware-request-x-harbor-locale")).toBe("es");
  });
  it("tell English pages they are English, whatever the visitor sends", async () => {
    const response = await visit("/browse", {
      "x-harbor-locale": "ar",
      "x-harbor-proxy": "forged:/browse",
    });
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-harbor-locale")).toBe("en");
  });
  it("give English and files one address", async () => {
    for (const [from, to] of [
      ["/en/browse", "/browse"],
      ["/en", "/"],
      ["/es/admin", "/admin"],
      ["/ru/saas/solofy.md", "/saas/solofy.md"],
    ]) {
      const response = await visit(from);
      expect(response.status, from).toBe(308);
      expect(new URL(response.headers.get("location")!).pathname, from).toBe(to);
    }
  });
  it("draw each language's sitemap", async () => {
    const response = await visit("/zh/sitemap.xml");
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://localhost/sitemap.xml");
    expect(response.headers.get("x-middleware-request-x-harbor-locale")).toBe("zh");
  });
});

describe("a first visit to an English address", () => {
  it("goes to the browser's language", async () => {
    const response = await visit("/saas/solofy?x=1", {
      "accept-language": "es-MX,es;q=0.9",
      "user-agent": chrome,
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/es/saas/solofy?x=1");
    expect(response.headers.get("vary")).toContain("Accept-Language");
  });
  it("goes to the language the visitor chose, which wins over the browser's", async () => {
    const chosen = await visit("/", {
      cookie: "locale=hi",
      "accept-language": "es",
      "user-agent": chrome,
    });
    expect(chosen.headers.get("location")).toBe("http://localhost/hi");
    const english = await visit("/", {
      cookie: "locale=en",
      "accept-language": "es",
      "user-agent": chrome,
    });
    expect(english.headers.get("location")).toBeNull();
  });
  it("stays in English for crawlers, form posts, files and English browsers", async () => {
    for (const [path, headers, method] of [
      [
        "/",
        {
          "accept-language": "es",
          "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)",
        },
        "GET",
      ],
      ["/dashboard", { "accept-language": "ru", "user-agent": chrome }, "POST"],
      ["/admin", { "accept-language": "ru", "user-agent": chrome }, "GET"],
      ["/browse", { "accept-language": "en-IN,hi;q=0.8", "user-agent": chrome }, "GET"],
    ] as const) {
      const response = await visit(path, headers, method);
      expect(response.headers.get("location"), path).toBeNull();
    }
  });
});
