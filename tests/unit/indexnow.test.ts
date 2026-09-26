import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  INDEXNOW_KEY,
  INDEXNOW_KEY_PATH,
  indexNowNotice,
  notifySearchEngines,
} from "../../src/lib/indexnow";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://harbor.example";
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("IndexNow", () => {
  it("names the site, where its key is, and each page once", () =>
    expect(indexNowNotice(["/saas/querybird", "/saas/old-name", "/saas/querybird"])).toEqual({
      host: "harbor.example",
      key: INDEXNOW_KEY,
      keyLocation: `https://harbor.example${INDEXNOW_KEY_PATH}`,
      urlList: ["https://harbor.example/saas/querybird", "https://harbor.example/saas/old-name"],
    }));

  it("uses a key of the form the protocol accepts", () =>
    expect(INDEXNOW_KEY).toMatch(/^[a-zA-Z0-9-]{8,128}$/));

  it("sends nothing outside production", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("VERCEL_ENV", "preview");
    await notifySearchEngines(["/saas/querybird"]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts the notice in production, and a refusal only logs", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("VERCEL_ENV", "production");
    await notifySearchEngines(["/saas/querybird"]);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.indexnow.org/indexnow");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({
      urlList: ["https://harbor.example/saas/querybird"],
    });
    expect(log).toHaveBeenCalledWith("IndexNow refused a notice:", 429);
    log.mockRestore();
  });

  it("keeps a failed connection from reaching the founder", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(notifySearchEngines(["/saas/querybird"])).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("IndexNow could not be reached:", "TypeError");
    log.mockRestore();
  });
});
