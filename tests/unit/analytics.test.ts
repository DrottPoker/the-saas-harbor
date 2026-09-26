import { describe, expect, it } from "vitest";
import {
  analyticsPeriod,
  analyticsRange,
  beaconSchema,
  browserName,
  bucketLabel,
  bucketTitle,
  clientAddress,
  countryCode,
  countryName,
  deviceType,
  isAdminPath,
  isAutomated,
  pageView,
  parseAnalytics,
  percentChange,
  referrerHost,
  systemName,
  vercelEvent,
} from "../../src/lib/analytics";

describe("analytics", () => {
  it("never measures admin pages", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/feedback")).toBe(true);
    expect(isAdminPath("/administrator")).toBe(false);
    expect(isAdminPath("/")).toBe(false);
    expect(vercelEvent({ type: "pageview", url: "https://thesaasharbor.com/admin" })).toBeNull();
    expect(
      vercelEvent({ type: "pageview", url: "https://thesaasharbor.com/admin/log?page=2" }),
    ).toBeNull();
  });

  it("sends Vercel only the path and campaign tags", () => {
    expect(
      vercelEvent({
        type: "pageview",
        url: "https://thesaasharbor.com/auth/confirm?token_hash=secret&type=signup#top",
      }),
    ).toEqual({ type: "pageview", url: "https://thesaasharbor.com/auth/confirm" });
    expect(
      vercelEvent({
        type: "event",
        url: "https://thesaasharbor.com/discover?q=crm&utm_source=x&utm_campaign=launch&utm_id=1",
      }),
    ).toEqual({
      type: "event",
      url: "https://thesaasharbor.com/discover?utm_source=x&utm_campaign=launch",
    });
    expect(vercelEvent({ type: "pageview", url: "https://thesaasharbor.com/" })).toEqual({
      type: "pageview",
      url: "https://thesaasharbor.com/",
    });
  });

  it("keeps the path of a page view, with ids replaced, and its campaign tags", () => {
    expect(
      pageView("/saas/querybird?q=crm&utm_source=hn&utm_medium=%20social%20&utm_campaign="),
    ).toEqual({
      path: "/saas/querybird",
      utmSource: "hn",
      utmMedium: "social",
      utmCampaign: null,
    });
    expect(pageView("/messages/0b6f2c1e-8e0a-4d0e-9b8f-6a1d2c3e4f50")?.path).toBe("/messages/[id]");
    expect(pageView("/dashboard/saas/0B6F2C1E-8E0A-4D0E-9B8F-6A1D2C3E4F50/")?.path).toBe(
      "/dashboard/saas/[id]",
    );
    expect(pageView("/")?.path).toBe("/");
    expect(pageView("/about/")?.path).toBe("/about");
    expect(pageView(`/?utm_campaign=${"x".repeat(150)}`)?.utmCampaign).toHaveLength(100);
    for (const other of [
      "",
      "about",
      "//evil.example/x",
      "/\\evil.example",
      "https://evil.example/",
      "/admin",
      "/admin/log",
    ])
      expect(pageView(other)).toBeNull();
    expect(pageView(`/${"a".repeat(300)}`)).toBeNull();
  });

  it("keeps only other sites as referrers, without www", () => {
    const site = "thesaasharbor.com";
    expect(referrerHost("https://www.Google.com/search?q=saas", site)).toBe("google.com");
    expect(referrerHost("https://news.ycombinator.com/item?id=1", site)).toBe(
      "news.ycombinator.com",
    );
    expect(referrerHost("https://www.thesaasharbor.com/stats", site)).toBeNull();
    expect(referrerHost("https://thesaasharbor.com/", site)).toBeNull();
    expect(referrerHost("http://127.0.0.1:3001/about", "127.0.0.1:3001")).toBeNull();
    for (const other of [null, undefined, "", "not a url", "android-app://com.google.android.gm/"])
      expect(referrerHost(other, site)).toBeNull();
  });

  it("leaves out bots, scripts and headless browsers", () => {
    const chrome =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
    expect(isAutomated(chrome)).toBe(false);
    for (const agent of [
      null,
      "",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      chrome.replace("Chrome/", "HeadlessChrome/"),
      "curl/8.4.0",
      "python-requests/2.32",
      "Mozilla/5.0 (compatible; UptimeRobot/2.0)",
    ])
      expect(isAutomated(agent)).toBe(true);
  });

  it("names devices, browsers and systems in a few groups", () => {
    expect(deviceType(undefined)).toBe("desktop");
    expect(deviceType("mobile")).toBe("mobile");
    expect(deviceType("tablet")).toBe("tablet");
    expect(deviceType("smarttv")).toBe("other");
    expect(
      [
        "Chrome",
        "Mobile Chrome",
        "Chrome WebView",
        "Mobile Safari",
        "Safari",
        "Firefox",
        "Mobile Firefox",
        "Edge",
        "Opera",
        "Samsung Browser",
        "Yandex",
        undefined,
      ].map(browserName),
    ).toEqual([
      "Chrome",
      "Chrome",
      "Chrome",
      "Safari",
      "Safari",
      "Firefox",
      "Firefox",
      "Edge",
      "Opera",
      "Samsung Internet",
      "Other",
      "Other",
    ]);
    expect(
      [
        "Windows",
        "Mac OS",
        "macOS",
        "iOS",
        "Android",
        "Chromium OS",
        "Ubuntu",
        "Linux",
        "HarmonyOS",
        undefined,
      ].map(systemName),
    ).toEqual([
      "Windows",
      "macOS",
      "macOS",
      "iOS",
      "Android",
      "ChromeOS",
      "Linux",
      "Linux",
      "Other",
      "Other",
    ]);
  });

  it("reads the country and client address from the host's headers", () => {
    expect(countryCode("SE")).toBe("SE");
    for (const other of [null, "", "se", "SWE", "XX"]) expect(countryCode(other)).toBeNull();
    expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe(
      "203.0.113.7",
    );
    expect(clientAddress(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientAddress(new Headers())).toBe("");
    expect(countryName("SE")).toBe("Sweden");
    expect(countryName(null)).toBe("Unknown");
  });

  it("accepts only small beacons with a path and referrer", () => {
    expect(beaconSchema.safeParse({ path: "/", referrer: null }).success).toBe(true);
    expect(beaconSchema.safeParse({ path: "/" }).success).toBe(true);
    expect(beaconSchema.safeParse({ path: 1 }).success).toBe(false);
    expect(beaconSchema.safeParse({ path: `/${"a".repeat(2000)}` }).success).toBe(false);
  });

  it("builds each period from whole UTC buckets up to now", () => {
    const now = new Date("2026-03-01T13:45:10Z");
    expect(analyticsPeriod("24h", now)).toEqual({
      from: "2026-02-28T14:00:00.000Z",
      to: "2026-03-01T13:45:10.000Z",
      bucket: "hour",
    });
    expect(analyticsPeriod("7d", now).from).toBe("2026-02-23T00:00:00.000Z");
    expect(analyticsPeriod("30d", now).from).toBe("2026-01-31T00:00:00.000Z");
    expect(analyticsPeriod("90d", now).bucket).toBe("day");
    expect(analyticsPeriod("12m", now)).toMatchObject({
      from: "2025-04-01T00:00:00.000Z",
      bucket: "month",
    });
    expect(analyticsRange("7d")).toBe("7d");
    for (const other of [undefined, "", "1y", "toString", "__proto__"])
      expect(analyticsRange(other)).toBe("30d");
  });

  it("labels buckets and changes", () => {
    const start = "2026-09-26T14:00:00+00:00";
    expect(bucketLabel(start, "hour")).toBe("14:00");
    expect(bucketLabel(start, "day")).toBe("Sep 26");
    expect(bucketLabel(start, "month")).toBe("Sep 2026");
    expect(bucketTitle(start, "hour")).toBe("Sep 26, 14:00 UTC");
    expect(bucketTitle(start, "day")).toBe("Sat, Sep 26, 2026");
    expect(bucketTitle(start, "month")).toBe("September 2026");
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(5, 0)).toBeNull();
  });

  it("reads the admin totals and refuses anything malformed", () => {
    const valid = {
      visitors: 3,
      visits: 3,
      page_views: 4,
      previous: { visitors: 1, visits: 1, page_views: 1 },
      live: 0,
      series: [{ start: "2026-01-01T00:00:00+00:00", visitors: 2, page_views: 3 }],
      pages: [{ path: "/", visitors: 2, page_views: 2 }],
      sources: [{ source: null, visits: 1 }],
      campaigns: [],
      countries: [{ country: null, visitors: 1 }],
      devices: [{ device: "desktop", visitors: 2 }],
      browsers: [{ browser: "Chrome", visitors: 1 }],
      systems: [{ os: "Windows", visitors: 1 }],
    };
    expect(parseAnalytics(valid)).toEqual(valid);
    expect(() => parseAnalytics({ ...valid, visitors: -1 })).toThrow();
    expect(() =>
      parseAnalytics({ ...valid, devices: [{ device: "watch", visitors: 1 }] }),
    ).toThrow();
    expect(() => parseAnalytics(null)).toThrow();
  });
});
