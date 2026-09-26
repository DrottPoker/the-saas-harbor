import "server-only";
import { after } from "next/server";
import { siteUrl } from "./seo";
import { publicClient } from "./supabase/server";

// IndexNow (indexnow.org) tells Bing, Yandex, Seznam, Naver and the other search engines that take
// part that a page was added, changed or removed, instead of waiting for them to read the sitemap
// again. Bing's index also serves ChatGPT search, Copilot and DuckDuckGo. The key is public by
// design: the engines read it at INDEXNOW_KEY_PATH to check that a notice came from this site.
export const INDEXNOW_KEY = "0273ba42d32fd9b44a070251775b1dd4";
export const INDEXNOW_KEY_PATH = "/indexnow.txt";
const ENDPOINT = "https://api.indexnow.org/indexnow";

/** Only production tells search engines about its pages. */
const enabled = () => process.env.VERCEL_ENV === "production";

/** The notice for pages of this site, given by their paths. */
export function indexNowNotice(paths: string[]) {
  const base = siteUrl();
  return {
    host: new URL(base).host,
    key: INDEXNOW_KEY,
    keyLocation: `${base}${INDEXNOW_KEY_PATH}`,
    urlList: [...new Set(paths)].map((path) => `${base}${path}`),
  };
}

/** Sends a notice. A failure is logged and changes nothing else: the sitemap still lists the page. */
export async function notifySearchEngines(paths: string[]) {
  if (!enabled() || !paths.length) return;
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(indexNowNotice(paths)),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    // 200 and 202 mean the notice was received.
    if (!response.ok) console.error("IndexNow refused a notice:", response.status);
  } catch (error) {
    console.error("IndexNow could not be reached:", error instanceof Error ? error.name : "error");
  }
}

/**
 * After the response, announces a saved product's page. It is read as a visitor would read it, so a
 * hidden product, or one whose founder is suspended, is never announced. A renamed product's earlier
 * address is announced too, since it now redirects.
 */
export function announceProduct(id: string, previousSlug: string | null) {
  if (!enabled()) return;
  after(async () => {
    const client = publicClient();
    if (!client) return;
    const { data } = await client.from("public_saas").select("slug").eq("id", id).maybeSingle();
    if (!data?.slug) return;
    await notifySearchEngines([
      `/saas/${data.slug}`,
      ...(previousSlug && previousSlug !== data.slug ? [`/saas/${previousSlug}`] : []),
    ]);
  });
}

/** After the response, announces a deleted product's address, which now answers 404. */
export function announceRemovedProduct(slug: string | null) {
  if (!enabled() || !slug) return;
  after(() => notifySearchEngines([`/saas/${slug}`]));
}
