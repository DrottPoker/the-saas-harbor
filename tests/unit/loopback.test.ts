import { afterEach, describe, expect, it, vi } from "vitest";
import { isLoopbackHost, isSecureOrLocalUrl } from "../../src/lib/loopback";
import { apiBase } from "../../src/lib/revenue/http";
import { telegramConfig } from "../../src/lib/telegram/api";

describe("addresses that may carry keys", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("are https, or plain http to this machine", () => {
    for (const host of ["127.0.0.1", "localhost", "LOCALHOST", "::1", "[::1]"])
      expect(isLoopbackHost(host)).toBe(true);
    expect(isLoopbackHost("127.0.0.2.example")).toBe(false);
    expect(isSecureOrLocalUrl("https://api.stripe.com")).toBe(true);
    expect(isSecureOrLocalUrl("http://127.0.0.1:3011/paddle")).toBe(true);
    expect(isSecureOrLocalUrl("http://[::1]:3011")).toBe(true);
    expect(isSecureOrLocalUrl("http://api.stripe.com")).toBe(false);
    expect(isSecureOrLocalUrl("http://127.0.0.1.example.com")).toBe(false);
    expect(isSecureOrLocalUrl("ftp://127.0.0.1")).toBe(false);
    expect(isSecureOrLocalUrl("not a url")).toBe(false);
  });

  it("are the only provider overrides a server uses, in every environment", () => {
    expect(apiBase(undefined, "https://api.stripe.com", "Stripe")).toBe("https://api.stripe.com");
    expect(apiBase("http://127.0.0.1:3011/", "https://api.stripe.com", "Stripe")).toBe(
      "http://127.0.0.1:3011",
    );
    expect(() => apiBase("http://fake.example", "https://api.stripe.com", "Stripe")).toThrow(
      "Stripe verification is not configured correctly on this server.",
    );
  });

  it("are the only Telegram addresses that get the bot token", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:secret-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "42");
    vi.stubEnv("TELEGRAM_API_BASE", "http://127.0.0.1:3011/telegram/");
    expect(telegramConfig()?.base).toBe("http://127.0.0.1:3011/telegram");
    vi.stubEnv("TELEGRAM_API_BASE", "http://telegram.example");
    expect(() => telegramConfig()).toThrow("TELEGRAM_API_BASE must use https.");
  });
});
