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

describe("verification rates", () => {
  const rows = (rate: number) =>
    new Response(JSON.stringify([{ quote: "eur", rate, date: "2026-10-28" }]));

  it("uses a rate read in the last hour again, and asks only for the others", async () => {
    const fetcher = vi.fn().mockImplementation(async (url: URL) => {
      const quotes = url.searchParams.get("quotes")!.split(",");
      return new Response(
        JSON.stringify(quotes.map((quote) => ({ quote, rate: 2, date: "2026-10-28" }))),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const { usdRates } = await import("../../src/lib/revenue/fx");
    expect((await usdRates(["EUR", "usd"])).rates).toEqual(new Map([["eur", 2]]));
    expect((await usdRates(["eur"])).date).toBe("2026-10-28");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await usdRates(["eur", "brl"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0].searchParams.get("quotes")).toBe("brl");
    vi.setSystemTime(new Date("2026-10-28T13:01:00Z"));
    await usdRates(["eur"]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(await usdRates([])).toEqual({ rates: new Map(), date: null });
  });

  it("serves the last rates for three days while the service does not answer", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(rows(0.92));
    vi.stubGlobal("fetch", fetcher);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { usdRates } = await import("../../src/lib/revenue/fx");
    await usdRates(["eur"]);
    fetcher.mockRejectedValue(new Error("Unavailable"));
    vi.setSystemTime(new Date("2026-10-31T11:00:00Z"));
    expect((await usdRates(["eur"])).rates.get("eur")).toBe(0.92);
    expect(warn).toHaveBeenCalledOnce();
    // A currency never read has no rate to fall back on.
    await expect(usdRates(["eur", "brl"])).rejects.toThrow(/Exchange rates are unavailable/);
    vi.setSystemTime(new Date("2026-10-31T12:01:00Z"));
    await expect(usdRates(["eur"])).rejects.toThrow(/Exchange rates are unavailable/);
  });

  it("treats an answer in an unknown form as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"message":"down"}')));
    const { usdRates } = await import("../../src/lib/revenue/fx");
    await expect(usdRates(["eur"])).rejects.toThrow(/Exchange rates are unavailable/);
  });

  it("leaves out a currency the service has no rate for", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => rows(0.92)),
    );
    const { usdRates } = await import("../../src/lib/revenue/fx");
    expect([...(await usdRates(["eur", "xxx"])).rates.keys()]).toEqual(["eur"]);
  });

  it("drops a rate it held once the service answers without it", async () => {
    const fetcher = vi.fn().mockImplementation(async () => rows(0.92));
    vi.stubGlobal("fetch", fetcher);
    const { usdRates } = await import("../../src/lib/revenue/fx");
    expect((await usdRates(["eur"])).rates.get("eur")).toBe(0.92);
    // The service stops publishing the currency: its last rate is not used in its place.
    fetcher.mockImplementation(async () => new Response("[]"));
    vi.setSystemTime(new Date("2026-10-28T13:01:00Z"));
    expect((await usdRates(["eur"])).rates.has("eur")).toBe(false);
  });
});
