import { describe, expect, it } from "vitest";
import { getTranslations } from "next-intl/server";
import { usernameLockDays } from "../../src/lib/account";

describe("a locked username", () => {
  const now = Date.parse("2026-09-26T12:00:00Z");
  it("counts the days until it can change, a part of a day as a day", () => {
    expect(usernameLockDays("2026-10-26T12:00:00Z", now)).toBe(30);
    expect(usernameLockDays("2026-09-27T01:00:00Z", now)).toBe(1);
    expect(usernameLockDays("2026-09-26T12:00:01Z", now)).toBe(1);
    expect(usernameLockDays("2026-09-28T12:00:01Z", now)).toBe(3);
  });
  it("says so in each language with the right plural", async () => {
    const en = await getTranslations({ locale: "en", namespace: "account.actions" });
    expect(en("usernameLocked", { days: 30 })).toBe(
      "You can change your username again in 30 days.",
    );
    expect(en("usernameLocked", { days: 1 })).toBe("You can change your username again in 1 day.");
    const ru = await getTranslations({ locale: "ru", namespace: "account.actions" });
    expect(ru("usernameLocked", { days: 1 })).toContain("1 день");
    expect(ru("usernameLocked", { days: 3 })).toContain("3 дня");
    expect(ru("usernameLocked", { days: 30 })).toContain("30 дней");
  });
});
