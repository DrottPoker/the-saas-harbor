import { excerpt } from "./moderation";
import { SITE_NAME } from "./seo";

/** Links that open a post about the page on X and LinkedIn, which show its sharing card. */
export function shareLinks(url: string, text: string) {
  return {
    x: `https://x.com/intent/post?${new URLSearchParams({ text, url })}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?${new URLSearchParams({ url })}`,
  };
}

/**
 * The text of a post about a product its founder just listed. X adds the page's address after it,
 * and the post shows the product's sharing card.
 */
export function productShareText(name: string, tagline: string | null) {
  const intro = `I just listed ${name} on ${SITE_NAME}.`;
  const line = tagline ? excerpt(tagline, 160) : "";
  return line ? `${intro}\n\n${line}` : intro;
}
