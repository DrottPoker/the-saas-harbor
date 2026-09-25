import "server-only";

// Plain-text answers for AI assistants: llms.txt and the Markdown versions of public pages. They
// hold public data only; search engines index the HTML pages instead of these copies.
export function textResponse(
  body: string,
  { type, canonical }: { type: "text/plain" | "text/markdown"; canonical?: string },
) {
  return new Response(body, {
    headers: {
      "Content-Type": `${type}; charset=utf-8`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      ...(canonical && { Link: `<${canonical}>; rel="canonical"` }),
    },
  });
}

export function textNotFound() {
  return new Response("Not found\n", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** A permanent redirect to a page's current Markdown address. */
export function textRedirect(path: string) {
  return new Response(null, {
    status: 308,
    headers: { Location: `${path}.md`, "Cache-Control": "no-store" },
  });
}
