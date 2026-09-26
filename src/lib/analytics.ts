// Page view measurement. Pure, so it is unit-tested.

// Only campaign tags stay in an address; other query values can carry tokens or search terms.
const KEPT_PARAMS = /^utm_(source|medium|campaign|term|content)$/;

/** Admin pages are never measured. */
export function isAdminPath(path: string) {
  return path === "/admin" || path.startsWith("/admin/");
}

/**
 * What Vercel Web Analytics receives for an event: nothing for admin pages, and otherwise the
 * address with only its campaign tags and no fragment.
 */
export function vercelEvent<T extends { url: string }>(event: T): T | null {
  const url = new URL(event.url);
  if (isAdminPath(url.pathname)) return null;
  for (const name of [...url.searchParams.keys()])
    if (!KEPT_PARAMS.test(name)) url.searchParams.delete(name);
  url.hash = "";
  return { ...event, url: url.toString() };
}
