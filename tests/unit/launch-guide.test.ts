import { describe, expect, it } from "vitest";
import { GUIDE_CHECKED, GUIDE_PUBLISHED, launchGroups } from "../../src/lib/launch-guide";

const places = launchGroups.flatMap((group) => group.places);

describe("the launch guide", () => {
  it("gives every group and place its own id, for headings and anchors", () => {
    const ids = [...launchGroups.map((group) => group.id), ...places.map((place) => place.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("links other sites over https and this site by path", () => {
    for (const place of places)
      expect(place.url, place.name).toMatch(place.internal ? /^\/[a-z0-9/-]*$/ : /^https:\/\//);
  });

  it("leaves out prices, which change too often to keep", () => {
    for (const place of places)
      for (const text of [place.summary, place.how, place.cost, place.bestFor, place.tip ?? ""])
        expect(text, place.name).not.toMatch(/[$€£]\s?\d/);
  });

  it("says when it was checked, never before it was published", () => {
    for (const date of [GUIDE_PUBLISHED, GUIDE_CHECKED])
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(GUIDE_CHECKED >= GUIDE_PUBLISHED).toBe(true);
  });
});
