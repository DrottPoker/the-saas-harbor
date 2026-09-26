import { describe, expect, it } from "vitest";
import {
  beaconSchema,
  browserName,
  cityName,
  clientAddress,
  countryCode,
  deviceType,
  isAdminPath,
  isAutomated,
  languageCode,
  majorVersion,
  outboundTarget,
  pageView,
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
      pageView(
        "/saas/querybird?q=crm&utm_source=hn&utm_medium=%20social%20&utm_campaign=&utm_term=mrr&utm_content=hero",
      ),
    ).toEqual({
      path: "/saas/querybird",
      utmSource: "hn",
      utmMedium: "social",
      utmCampaign: null,
      utmTerm: "mrr",
      utmContent: "hero",
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
    expect(cityName("S%C3%B6dert%C3%A4lje")).toBe("Södertälje");
    for (const other of [null, "", "%E0%A4%A", "a".repeat(101)]) expect(cityName(other)).toBeNull();
    expect(languageCode("sv-SE,sv;q=0.9,en;q=0.8")).toBe("sv");
    expect(languageCode("EN")).toBe("en");
    for (const other of [null, "", "*", "english"]) expect(languageCode(other)).toBeNull();
  });

  it("keeps the major version of a browser or system", () => {
    expect(majorVersion("140.0.7339.80")).toBe("140");
    expect(majorVersion("10")).toBe("10");
    expect(majorVersion("17.5.1")).toBe("17");
    for (const other of [undefined, "", "beta", "12345.1"]) expect(majorVersion(other)).toBeNull();
  });

  it("keeps a clicked link to another site without its query", () => {
    const site = "thesaasharbor.com";
    expect(outboundTarget("https://www.Example.com/pricing?ref=harbor#plans", site)).toEqual({
      target: "https://www.example.com/pricing",
      host: "example.com",
    });
    expect(outboundTarget(`https://example.com/${"a".repeat(400)}`, site)).toEqual({
      target: "https://example.com/",
      host: "example.com",
    });
    for (const other of [
      "https://thesaasharbor.com/stats",
      "https://www.thesaasharbor.com/",
      "mailto:hello@example.com",
      "javascript:alert(1)",
      "not a url",
    ])
      expect(outboundTarget(other, site)).toBeNull();
  });

  it("accepts only small beacons of the three kinds", () => {
    expect(beaconSchema.parse({ type: "pageview", path: "/", referrer: null })).toEqual({
      type: "pageview",
      path: "/",
      referrer: null,
    });
    // The first version of the script sent page views without a type.
    expect(beaconSchema.parse({ path: "/" })).toEqual({ type: "pageview", path: "/" });
    expect(beaconSchema.parse({ type: "engagement", id: 12, ms: 3400 })).toEqual({
      type: "engagement",
      id: 12,
      ms: 3400,
    });
    expect(
      beaconSchema.safeParse({ type: "outbound", path: "/", url: "https://example.com" }).success,
    ).toBe(true);
    for (const other of [
      { path: 1 },
      { path: `/${"a".repeat(2000)}` },
      { type: "engagement", id: -1, ms: 10 },
      { type: "engagement", id: 1, ms: 1.5 },
      { type: "outbound", path: "/" },
      { type: "click", path: "/" },
      null,
    ])
      expect(beaconSchema.safeParse(other).success).toBe(false);
  });
});
