import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/types";
import { rememberAccountPreferences } from "../../src/lib/account-preferences";
import {
  accountLanguageLabel,
  accountCurrencyLabel,
} from "../../src/lib/account-preference-labels";

afterEach(() => vi.restoreAllMocks());

function fixture(metadata: Record<string, unknown> = {}) {
  const updateUser = vi.fn().mockResolvedValue({ error: null });
  return {
    client: { auth: { updateUser } } as unknown as SupabaseClient<Database>,
    user: { user_metadata: metadata },
    updateUser,
  };
}

describe("account preferences", () => {
  it("saves detected language and currency on an existing account", async () => {
    const { client, user, updateUser } = fixture();
    await rememberAccountPreferences(client, user, { locale: "es", currency: "MXN" });
    expect(updateUser).toHaveBeenCalledWith({ data: { locale: "es", currency: "MXN" } });
  });
  it("changes only the currency without overwriting the language or other metadata", async () => {
    const { client, user, updateUser } = fixture({
      locale: "ar",
      currency: "USD",
      username: "test",
    });
    await rememberAccountPreferences(client, user, { currency: "EUR" });
    expect(updateUser).toHaveBeenCalledWith({ data: { currency: "EUR" } });
  });
  it("does not rewrite unchanged preferences or accept unsupported values", async () => {
    const { client, user, updateUser } = fixture({ locale: "es", currency: "EUR" });
    await rememberAccountPreferences(client, user, { locale: "es", currency: "EUR" });
    await rememberAccountPreferences(client, user, { locale: "invalid", currency: "XYZ" });
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("keeps sign-in working on a save failure and logs only the error code", async () => {
    const { client, user, updateUser } = fixture();
    updateUser.mockResolvedValue({ error: { code: "failed", message: "private detail" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      rememberAccountPreferences(client, user, { currency: "INR" }),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledExactlyOnceWith("Saving account preferences failed:", "failed");
  });
  it("shows English admin labels for all supported languages", () => {
    expect(["en", "zh", "hi", "ar", "es", "ru", "ja"].map(accountLanguageLabel)).toEqual([
      "English",
      "Simplified Chinese",
      "Hindi",
      "Arabic",
      "Spanish",
      "Russian",
      "Japanese",
    ]);
    expect(accountCurrencyLabel("CNY")).toBe("CNY");
  });
  it("does not invent defaults for missing or invalid saved preferences", () => {
    for (const value of [null, undefined, "", "unknown", {}, 42]) {
      expect(accountLanguageLabel(value)).toBe("Not recorded");
      expect(accountCurrencyLabel(value)).toBe("Not recorded");
    }
  });
});
