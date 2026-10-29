import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../src/i18n/config";
import { GUIDE_CHECKED, GUIDE_PUBLISHED, launchGroups } from "../../src/lib/launch-guide";

const places = launchGroups.flatMap((group) => group.places);

type PlaceText = { summary: string; how: string; cost: string; bestFor: string; tip?: string };
const guideText = (locale: string): { places: Record<string, PlaceText> } =>
  JSON.parse(
    readFileSync(join(__dirname, `../../src/messages/${locale}/whereToLaunch.json`), "utf8"),
  );

describe("the launch guide", () => {
  it("gives every group and place its own id, for headings and anchors", () => {
    const ids = [...launchGroups.map((group) => group.id), ...places.map((place) => place.key)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of launchGroups) expect(group.id).toMatch(/^[a-z0-9-]+$/);
  });

  it("links other sites over https and this site by path", () => {
    for (const place of places)
      expect(place.url, place.name).toMatch(place.internal ? /^\/[a-z0-9/-]*$/ : /^https:\/\//);
  });

  it("has text for every place, with a tip where one is marked, and none for unknown places", () => {
    const text = guideText("en").places;
    expect(Object.keys(text).sort()).toEqual(places.map((place) => place.key).sort());
    for (const place of places) expect("tip" in text[place.key], place.name).toBe(!!place.tip);
  });

  it("leaves out prices in every language, which change too often to keep", () => {
    for (const locale of LOCALES)
      for (const place of places) {
        const { summary, how, cost, bestFor, tip = "" } = guideText(locale).places[place.key];
        for (const text of [summary, how, cost, bestFor, tip])
          expect(text, `${locale} ${place.name}`).not.toMatch(/[$€£₹¥]\s?\d|\d\s?[$€£₹¥]/);
      }
  });

  it("says when it was checked, never before it was published", () => {
    for (const date of [GUIDE_PUBLISHED, GUIDE_CHECKED])
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(GUIDE_CHECKED >= GUIDE_PUBLISHED).toBe(true);
  });
});
