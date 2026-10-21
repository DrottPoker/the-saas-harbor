import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "../../src/proxy";

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
