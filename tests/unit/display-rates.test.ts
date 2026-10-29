import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
  vi.stubEnv("FX_API_BASE", "http://127.0.0.1:3011");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("display reference rates", () => {
  it("shares a request, caches for six hours, and retains each currency's actual rate date", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { quote: "eur", rate: 0.92, date: "2026-10-28" },
          { quote: "ngn", rate: 1400, date: "2026-10-27" },
          { quote: "inr", rate: -1, date: "2026-10-28" },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const { displayRates } = await import("../../src/lib/revenue/fx");
    const a = displayRates(["USD", "EUR", "NGN", "INR"]);
    const b = displayRates(["USD", "EUR", "NGN", "INR"]);
    expect(a).toBe(b);
    const rates = await a;
    expect(rates?.rates.get("eur")).toBe(0.92);
    expect(rates?.dates.get("ngn")).toBe("2026-10-27");
    expect(rates?.rates.has("inr")).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await displayRates(["EUR"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-10-28T18:01:00Z"));
    fetcher.mockResolvedValueOnce(new Response("[]"));
    await displayRates(["EUR"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("returns no conversion on failure and retries after ten minutes", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("Unavailable"));
    vi.stubGlobal("fetch", fetcher);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { displayRates } = await import("../../src/lib/revenue/fx");
    expect(await displayRates(["EUR"])).toBeNull();
    expect(await displayRates(["EUR"])).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-10-28T12:11:00Z"));
    fetcher.mockResolvedValueOnce(
      new Response('[{"quote":"eur","rate":0.92,"date":"2026-10-28"}]'),
    );
    expect((await displayRates(["EUR"]))?.rates.get("eur")).toBe(0.92);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
