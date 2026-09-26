import "server-only";
import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";
import { adminClient } from "./supabase/admin";

// Founders prove that they control their product's domain with a DNS TXT record, a token per
// product (migration 20260926100000). The founder's check and the daily check of verified domains
// look the record up here; only the result is stored, through record_domain_check.

/** The record's name is this label in front of the product's domain. */
export const RECORD_LABEL = "_thesaasharbor";
const VALUE_PREFIX = "thesaasharbor-verification=";

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

export function recordName(domain: string) {
  return `${RECORD_LABEL}.${domain}`;
}

export function recordValue(token: string) {
  return `${VALUE_PREFIX}${token}`;
}

export type LookupResult = "found" | "missing" | "error";
type TxtResolver = Pick<Resolver, "resolveTxt">;

// The browser tests answer DNS from a local server; production always uses the system's resolver.
function defaultResolver(): TxtResolver {
  const resolver = new Resolver({ timeout: 3000, tries: 2 });
  const servers = process.env.DOMAIN_DNS_SERVERS;
  if (servers && process.env.NODE_ENV !== "production") resolver.setServers(servers.split(","));
  return resolver;
}

const code = (error: unknown) => (error as { code?: string } | null)?.code ?? "";

/**
 * Whether the product's record is in DNS. A name that does not exist or has no TXT records is
 * missing; any other failure, such as a timeout, is an error, which changes nothing.
 */
export async function lookupDomainRecord(
  domain: string,
  token: string,
  resolver: TxtResolver = defaultResolver(),
): Promise<LookupResult> {
  try {
    const records = await resolver.resolveTxt(recordName(domain));
    // A long TXT value arrives in chunks of up to 255 characters.
    return records.some((chunks) => chunks.join("").trim() === recordValue(token))
      ? "found"
      : "missing";
  } catch (error) {
    return ["ENOTFOUND", "ENODATA"].includes(code(error)) ? "missing" : "error";
  }
}

/** What record_domain_check did with a result. */
export type DomainOutcome =
  "verified" | "missing" | "grace" | "removed" | "error" | "changed" | "gone";

/** Looks the record up and stores the result. The website is the one the domain came from. */
export async function checkDomain(saasId: string, website: string, token: string) {
  const domain = websiteDomain(website);
  if (!domain) throw new Error("The website has no domain to check.");
  const result = await lookupDomainRecord(domain, token);
  const { data, error } = await adminClient().rpc("record_domain_check", {
    p_saas: saasId,
    p_website: website,
    p_domain: domain,
    p_result: result,
  });
  if (error) throw new Error(`The domain check could not be recorded: ${error.message}`);
  return data as DomainOutcome;
}

/**
 * The daily check of verified domains, twenty at a time, until none is due or `budgetMs` has
 * passed. The database calls it every hour (/api/domains/check).
 */
export async function recheckVerifiedDomains({ budgetMs = 50_000 } = {}) {
  const started = Date.now();
  const counts: Record<DomainOutcome | "failed", number> = {
    verified: 0,
    missing: 0,
    grace: 0,
    removed: 0,
    error: 0,
    changed: 0,
    gone: 0,
    failed: 0,
  };
  while (Date.now() - started < budgetMs) {
    const { data, error } = await adminClient().rpc("claim_due_domain_checks", { p_limit: 20 });
    if (error) throw new Error("Due domain checks could not be claimed.");
    if (!data.length) break;
    await Promise.all(
      data.map(async (row) => {
        try {
          counts[await checkDomain(row.saas_id, row.website, row.token)]++;
        } catch {
          counts.failed++;
        }
      }),
    );
  }
  return counts;
}
