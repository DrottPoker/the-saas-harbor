import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Scans the page for WCAG 2.1 AA violations, as a soft expectation. */
export async function expectAccessible(page: Page) {
  // Axe measures colors as they are on screen, so it waits for transitions, such as a chip that
  // changes color when another is chosen, to finish. Endless animations do not count.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== "running" ||
          animation.effect?.getTiming().iterations === Infinity,
      ),
  );
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect
    .soft(
      accessibility.violations.map((issue) => ({
        page: new URL(page.url()).pathname,
        id: issue.id,
        nodes: issue.nodes.map((node) => node.target),
      })),
    )
    .toEqual([]);
}
