import { describe, expect, it } from "vitest";
import { profileSchema, roleSchema } from "../../src/lib/domain";
import {
  formatDuration,
  formatMonth,
  monthsBetween,
  parseSkills,
  rolePeriod,
  sortRoles,
} from "../../src/lib/profile";

const now = new Date(Date.UTC(2026, 8, 24));

describe("profile dates", () => {
  it("formats months and durations like LinkedIn", () => {
    expect(formatMonth("2024-03-01")).toBe("Mar 2024");
    expect(monthsBetween("2024-01-01", "2024-03-01")).toBe(3);
    expect(monthsBetween("2024-01-01", "2024-01-01")).toBe(1);
    expect(monthsBetween("2024-01-01", null, now)).toBe(33);
    expect(formatDuration(1)).toBe("1 mo");
    expect(formatDuration(8)).toBe("8 mos");
    expect(formatDuration(12)).toBe("1 yr");
    expect(formatDuration(33)).toBe("2 yrs 9 mos");
  });

  it("shows each role with its dates and duration", () => {
    expect(rolePeriod({ starts_on: "2024-01-01", ends_on: null }, now)).toBe(
      "Jan 2024 - Present · 2 yrs 9 mos",
    );
    expect(rolePeriod({ starts_on: "2020-05-01", ends_on: "2021-04-01" }, now)).toBe(
      "May 2020 - Apr 2021 · 1 yr",
    );
  });

  it("lists current roles first, then by end and by start, latest first", () => {
    const roles = [
      { id: "old", starts_on: "2010-01-01", ends_on: "2012-01-01" },
      { id: "long", starts_on: "2015-01-01", ends_on: "2020-01-01" },
      { id: "current", starts_on: "2021-01-01", ends_on: null },
      { id: "short", starts_on: "2018-01-01", ends_on: "2020-01-01" },
    ];
    expect(sortRoles(roles).map((role) => role.id)).toEqual(["current", "short", "long", "old"]);
  });
});

describe("profile input", () => {
  const valid = {
    name: "Lena Okafor",
    headline: "Solo founder",
    location: "Gothenburg, Sweden",
    bio: "Building finance tools.",
    website: "",
    linkedin_url: "https://www.linkedin.com/in/lena",
    github_url: "https://github.com/lena",
    x_url: "https://x.com/lena",
    social_url: "",
    skills: ["Postgres"],
    experience: [],
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

  it("parses skills from a list and limits them", () => {
    expect(parseSkills("Postgres, next.js\nNext.js,  Growth   hacking ,,")).toEqual([
      "Postgres",
      "next.js",
      "Growth hacking",
    ]);
    const many = Array.from({ length: 21 }, (_, n) => `Skill ${n}`);
    expect(profileSchema.safeParse({ ...valid, skills: many }).success).toBe(false);
  });

  it("validates role dates", () => {
    const role = {
      title: "Founder",
      organization: "Ledgerloop",
      start: "2022-01",
      end: null,
      description: "",
    };
    expect(roleSchema.safeParse(role).success).toBe(true);
    expect(roleSchema.safeParse({ ...role, end: "2021-12" }).success).toBe(false);
    expect(roleSchema.safeParse({ ...role, start: "2999-01" }).success).toBe(false);
    expect(roleSchema.safeParse({ ...role, start: "2022-13" }).success).toBe(false);
    expect(roleSchema.safeParse({ ...role, title: " " }).success).toBe(false);
  });
});
