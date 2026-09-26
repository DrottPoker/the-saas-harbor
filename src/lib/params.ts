/** Search parameters as Next.js passes them: a repeated parameter arrives as a list. */
export type SearchParams = Record<string, string | string[] | undefined>;

/** One value per parameter, the first when it is repeated, so `?q=a&q=b` reads as a search for a. */
export function firstValues(params: SearchParams): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(params).map(([name, value]) => [name, Array.isArray(value) ? value[0] : value]),
  );
}

/** A page number from the address: 1 when missing or invalid, and at most 10,000. */
export function safePage(value: string | undefined) {
  return Math.min(10000, Math.max(1, Number.parseInt(value || "1", 10) || 1));
}
