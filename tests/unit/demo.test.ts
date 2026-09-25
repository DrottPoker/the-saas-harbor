import { describe, expect, it } from "vitest";
import { parseHistory } from "../../src/lib/charts";
import { demoFill, demoListings } from "../../src/lib/demo";
import { saasSchema } from "../../src/lib/domain";

const now = new Date("2026-09-25T12:00:00Z");
const all = demoListings(now);
const bySlug = (slug: string) => all.find((item) => item.slug === slug)!;
const fill = (options: Partial<Parameters<typeof demoFill>[1]> = {}) =>
  demoFill(all, { sort: "rank", category: "", search: "", page: 1, room: 12, ...options });

describe("demo products", () => {
  it("pass the rules a real product must meet", () => {
    const listing = saasSchema.pick({
      name: true,
      tagline: true,
      description: true,
      category: true,
      launched_on: true,
    });
    for (const item of all)
      expect(
        listing.safeParse({ ...item, launched_on: item.launched_on ?? "" }).success,
        item.slug!,
      ).toBe(true);
    expect(new Set(all.map((item) => item.slug)).size).toBe(all.length);
    expect(new Set(all.map((item) => item.demo!.logo.shape)).size).toBe(all.length);
    for (const item of all) expect(item.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
  it("are never verified, ranked, reachable or tied to an account", () => {
    for (const item of all) {
      expect(item.demo).toBeTruthy();
      expect(item.revenue_status).not.toBe("verified");
      expect(item.verified_at).toBeNull();
      expect(item.rank).toBeNull();
      expect(item.website).toBeNull();
      expect(item.owner_id).toBeNull();
      expect(item.owner_slug).toBeNull();
    }
  });
  it("show every revenue state a real product can be in", () => {
    expect(bySlug("metricfold").revenue_status).toBe("demo");
    expect(bySlug("swatchline")).toMatchObject({ revenue_status: "private", mrr_cents: null });
    expect(bySlug("hourbridge")).toMatchObject({
      revenue_status: "unverified",
      mrr_cents: null,
      customers: null,
      mrr_history: null,
    });
  });
});

describe("demo history", () => {
  it("covers the twelve month-ends before today, in the stored shape", () => {
    const history = parseHistory(bySlug("metricfold").mrr_history)!;
    expect(history.map((point) => point.month)).toEqual([
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
    for (const item of all.filter((item) => item.mrr_history))
      expect(parseHistory(item.mrr_history), item.slug!).not.toBeNull();
  });
  it("grows or shrinks toward today's figure, like a real product", () => {
    expect(bySlug("inboxwren").mrr_growth_pct).toBeGreaterThan(3);
    expect(bySlug("mockframe").mrr_growth_pct).toBeLessThan(0);
    for (const item of all.filter((item) => item.mrr_growth_pct != null))
      expect(Math.abs(item.mrr_growth_pct!), item.slug!).toBeLessThan(15);
  });
  it("is the same on every request in a month", () =>
    expect(demoListings(new Date("2026-09-02T08:00:00Z"))).toEqual(all));
});

describe("filling a list", () => {
  it("fills the leaderboard with products that share MRR, highest first", () => {
    const rows = fill();
    expect(rows).toHaveLength(12);
    expect(rows[0].slug).toBe("metricfold");
    expect(rows.map((row) => row.mrr_cents)).toEqual(
      [...rows.map((row) => row.mrr_cents)].sort((a, b) => b! - a!),
    );
    expect(rows.every((row) => row.mrr_cents != null)).toBe(true);
  });
  it("leaves only the room real products do not take", () => {
    expect(fill({ room: 3 })).toHaveLength(3);
    expect(fill({ room: 0 })).toEqual([]);
    expect(fill({ room: -4 })).toEqual([]);
  });
  it("shows nothing after the first page", () => expect(fill({ page: 2 })).toEqual([]));
  it("follows the category and the search, like the real products", () => {
    expect(fill({ sort: "name", category: "Finance" }).map((row) => row.name)).toEqual([
      "Quarterpot",
      "Retrywell",
    ]);
    expect(fill({ search: "  CRON*" }).map((row) => row.name)).toEqual(["Cronhawk"]);
    expect(fill({ search: "missing" })).toEqual([]);
  });
  it("lists every demo product in Browse and New arrivals, newest launch first", () => {
    expect(fill({ sort: "name", room: 20 })).toHaveLength(all.length);
    const newest = fill({ sort: "newest", room: 20 });
    expect(newest[0].slug).toBe("hourbridge");
    expect(newest.at(-1)!.launched_on).toBeNull();
  });
});
