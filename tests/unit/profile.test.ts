import { describe, expect, it } from "vitest";
import { latestDate, profileSchema } from "../../src/lib/domain";

describe("profile input", () => {
  const valid = {
    name: "Lena Okafor",
    headline: "Solo founder",
    location: "Gothenburg, Sweden",
    website: "",
    linkedin_url: "https://www.linkedin.com/in/lena",
    github_url: "https://github.com/lena",
    x_url: "https://x.com/lena",
    social_url: "",
  };

  it("accepts a full profile", () => expect(profileSchema.safeParse(valid).success).toBe(true));

  it("checks that each link points to its own site", () => {
    for (const [field, value] of [
      ["linkedin_url", "https://evil.example/in/lena"],
      ["linkedin_url", "https://www.linkedin.com"],
      ["github_url", "http://github.com/lena"],
      ["x_url", "https://x.com.evil.example/lena"],
    ])
      expect(profileSchema.safeParse({ ...valid, [field]: value }).success, value).toBe(false);
    expect(profileSchema.safeParse({ ...valid, x_url: "https://twitter.com/lena" }).success).toBe(
      true,
    );
  });
});

describe("the latest date", () => {
  it("is already tomorrow east of UTC late in the day", () => {
    expect(latestDate(new Date("2026-09-30T12:00:00Z"))).toBe("2026-10-01");
    expect(latestDate(new Date("2026-09-30T09:00:00Z"))).toBe("2026-09-30");
  });
});
