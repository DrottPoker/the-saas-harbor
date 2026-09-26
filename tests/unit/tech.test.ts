import { describe, expect, it } from "vitest";
import {
  groupTechStack,
  knownTech,
  techFromSlug,
  techGroups,
  technologies,
} from "../../src/lib/tech";

describe("the technology catalog", () => {
  it("has unique slugs and names in the form the database accepts", () => {
    const slugs = technologies.map((tech) => tech.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(technologies.map((tech) => tech.name.toLowerCase())).size).toBe(slugs.length);
    for (const slug of slugs) {
      // private.valid_tech_stack in migration 20260926090000
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(slug.length).toBeLessThanOrEqual(40);
    }
  });

  it("puts every technology in a group, and every group has some", () => {
    for (const group of techGroups)
      expect(technologies.some((tech) => tech.group === group)).toBe(true);
  });

  it("finds technologies by slug only", () => {
    expect(techFromSlug("nextjs")).toEqual({ slug: "nextjs", name: "Next.js", group: "Frontend" });
    expect(techFromSlug("Next.js")).toBeNull();
    expect(techFromSlug("")).toBeNull();
  });
});

describe("a product's stack", () => {
  it("is grouped in the catalog's order, whatever order it was saved in", () =>
    expect(
      groupTechStack(["stripe", "postgresql", "react", "nextjs"]).map(({ group, items }) => [
        group,
        items.map((tech) => tech.slug),
      ]),
    ).toEqual([
      ["Frontend", ["nextjs", "react"]],
      ["Databases", ["postgresql"]],
      ["Payments", ["stripe"]],
    ]));

  it("leaves out slugs that are not in the catalog", () => {
    expect(knownTech(["nextjs", "gone-now"]).map((tech) => tech.slug)).toEqual(["nextjs"]);
    expect(groupTechStack(null)).toEqual([]);
    expect(groupTechStack([])).toEqual([]);
  });
});
