import { isIP } from "node:net";

/**
 * The domain of a product's website, which the record goes on: its host in lowercase, without
 * www. and a final dot (an international name in its ASCII form). Null for an address that cannot
 * carry records of its own: an IP address or a name without a dot, such as localhost.
 */
export function websiteDomain(website: string | null | undefined) {
  try {
    const host = new URL(website ?? "").hostname
      .toLowerCase()
      .replace(/\.$/, "")
      .replace(/^www\./, "");
    if (!host.includes(".") || isIP(host) || host.startsWith("[") || host.endsWith(".localhost"))
      return null;
    return host;
  } catch {
    return null;
  }
}

/**
 * The verified domain while it is still the website's domain, as browsers read the address, or
 * null. Pages show the mark only then, whatever the database has stored.
 */
export function currentVerifiedDomain(
  website: string | null | undefined,
  verified: string | null | undefined,
) {
  return verified && verified === websiteDomain(website) ? verified : null;
}
