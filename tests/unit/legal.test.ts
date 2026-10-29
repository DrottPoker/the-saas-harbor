import { describe, expect, it } from "vitest";
import { legalDate, privacyUpdated, termsUpdated } from "../../src/lib/legal";

describe("legal dates", () => {
  it("are versions as YYYY-MM-DD, shown in words", () => {
    for (const date of [privacyUpdated, termsUpdated]) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(legalDate("2026-09-25")).toBe("September 25, 2026");
    expect(legalDate("2026-01-01")).toBe("January 1, 2026");
  });
  it("are shown in the page's language", () => {
    expect(legalDate("2026-10-27", "es-419")).toBe("27 de octubre de 2026");
    expect(legalDate("2026-10-27", "zh-CN")).toBe("2026年10月27日");
    expect(legalDate("2026-10-27", "ar-u-nu-latn")).toMatch(/^27 .+ 2026$/);
  });
});
