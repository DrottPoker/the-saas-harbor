import { describe, expect, it } from "vitest";
import {
  milestoneHeadline,
  milestoneKey,
  milestoneObject,
  milestonePath,
  milestoneSentence,
  MRR_MILESTONES,
  notableMilestones,
  parseMilestone,
  RANK_MILESTONES,
  shareLinks,
  shareText,
} from "../../src/lib/milestones";

describe("milestone keys", () => {
  it("parse every key the database records and nothing else", () => {
    for (const usd of MRR_MILESTONES)
      expect(parseMilestone(`mrr-${usd}`)).toEqual({ kind: "mrr", usd });
    for (const place of RANK_MILESTONES)
      expect(parseMilestone(`top-${place}`)).toEqual({ kind: "rank", place });
    for (const key of ["mrr-200", "top-2", "mrr-", "MRR-100", "mrr-100.5", "top-01", "x"])
      expect(parseMilestone(key)).toBeNull();
  });
  it("turn back into the same keys", () =>
    expect(milestoneKey(parseMilestone("mrr-10000")!)).toBe("mrr-10000"));
});

describe("milestone wording", () => {
  it("names thresholds and places", () => {
    expect(milestoneHeadline({ kind: "mrr", usd: 10000 })).toBe("$10K MRR");
    expect(milestoneHeadline({ kind: "mrr", usd: 1000000 })).toBe("$1M MRR");
    expect(milestoneHeadline({ kind: "rank", place: 10 })).toBe("Top 10");
    expect(milestoneHeadline({ kind: "rank", place: 1 })).toBe("#1");
    expect(milestoneObject({ kind: "rank", place: 1 })).toBe("first place");
    expect(milestoneSentence({ kind: "mrr", usd: 2500 }, "Tidewise")).toBe(
      "Tidewise reached $2,500 in monthly recurring revenue.",
    );
    expect(shareText({ kind: "rank", place: 3 }, "Tidewise")).toBe(
      "Tidewise is now in the top 3 on The SaaS Harbor's leaderboard of verified revenue.",
    );
  });
  it("lead with the best place, then the highest threshold", () => {
    expect(notableMilestones(["mrr-100", "top-10", "mrr-5000", "top-3", "bad"])).toEqual([
      { kind: "rank", place: 3 },
      { kind: "mrr", usd: 5000 },
    ]);
    expect(notableMilestones(["mrr-100", "mrr-500"])).toEqual([{ kind: "mrr", usd: 500 }]);
    expect(notableMilestones([])).toEqual([]);
  });
  it("build the page address and the share links", () => {
    expect(milestonePath("tidewise", { kind: "rank", place: 1 })).toBe(
      "/saas/tidewise/milestones/top-1",
    );
    const links = shareLinks("https://harbor.example/p", "A & B");
    expect(links.x).toBe(
      "https://x.com/intent/post?text=A+%26+B&url=https%3A%2F%2Fharbor.example%2Fp",
    );
    expect(links.linkedin).toBe(
      "https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fharbor.example%2Fp",
    );
  });
});
