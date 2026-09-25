/** Search parameters as Next.js passes them: a repeated parameter arrives as a list. */
export type SearchParams = Record<string, string | string[] | undefined>;

/** One value per parameter, the first when it is repeated, so `?q=a&q=b` reads as a search for a. */
export function firstValues(params: SearchParams): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(params).map(([name, value]) => [name, Array.isArray(value) ? value[0] : value]),
  );
}
