// What is stored for a Zoho Billing connection, which is made through OAuth (`oauth.ts`): the data
// centre the founder's account lives in, the organization chosen when connecting, and the refresh
// token, as `<data centre>:<organization id>:<refresh token>`. None of the parts contains a colon.
// Founders never paste anything for Zoho Billing, so `parseZohoKey` refuses every pasted value.
import { VerificationError } from "../errors";
import type { ParsedKey } from "../types";

/**
 * Zoho's data centres, by the domain that names them: the accounts server that issues tokens and
 * the API domain that serves Zoho Billing. The addresses come from this table only, never from a
 * response, so tokens and the client secret go to Zoho alone.
 */
export const DATA_CENTRES = {
  com: { accounts: "https://accounts.zoho.com", api: "https://www.zohoapis.com" },
  eu: { accounts: "https://accounts.zoho.eu", api: "https://www.zohoapis.eu" },
  in: { accounts: "https://accounts.zoho.in", api: "https://www.zohoapis.in" },
  "com.au": { accounts: "https://accounts.zoho.com.au", api: "https://www.zohoapis.com.au" },
  jp: { accounts: "https://accounts.zoho.jp", api: "https://www.zohoapis.jp" },
  ca: { accounts: "https://accounts.zohocloud.ca", api: "https://www.zohoapis.ca" },
  sa: { accounts: "https://accounts.zoho.sa", api: "https://www.zohoapis.sa" },
  "com.cn": { accounts: "https://accounts.zoho.com.cn", api: "https://www.zohoapis.com.cn" },
  uk: { accounts: "https://accounts.zoho.uk", api: "https://www.zohoapis.uk" },
} as const;

export type DataCentre = keyof typeof DATA_CENTRES;

export function isDataCentre(value: unknown): value is DataCentre {
  return typeof value === "string" && Object.hasOwn(DATA_CENTRES, value);
}

/** The `location` Zoho names a data centre by on the way back from approval. */
const LOCATIONS: Record<string, DataCentre> = {
  us: "com",
  eu: "eu",
  in: "in",
  au: "com.au",
  jp: "jp",
  ca: "ca",
  sa: "sa",
  cn: "com.cn",
  uk: "uk",
};

/**
 * The data centre the callback names: its accounts server, which must be one of Zoho's, or else
 * its location. Approval starts in the US data centre, so a callback that names neither is from it.
 */
export function callbackDataCentre(params: URLSearchParams): DataCentre {
  const server = params.get("accounts-server");
  if (server) {
    const found = (Object.keys(DATA_CENTRES) as DataCentre[]).find(
      (dc) => DATA_CENTRES[dc].accounts === server.replace(/\/$/, ""),
    );
    if (!found) throw new VerificationError("zoho.unknownDataCentre");
    return found;
  }
  const location = params.get("location");
  if (!location) return "com";
  const dc = LOCATIONS[location.toLowerCase()];
  if (!dc) throw new VerificationError("zoho.unknownDataCentre");
  return dc;
}

export type ZohoKey = { dc: DataCentre; organizationId: string; refreshToken: string };

const ORGANIZATION = /^[A-Za-z0-9]{1,40}$/;
const REFRESH_TOKEN = /^[A-Za-z0-9._-]{10,512}$/;

export function zohoStoredKey({ dc, organizationId, refreshToken }: ZohoKey) {
  if (!isDataCentre(dc) || !ORGANIZATION.test(organizationId) || !REFRESH_TOKEN.test(refreshToken))
    throw new VerificationError("zoho.notStorable");
  return `${dc}:${organizationId}:${refreshToken}`;
}

export function readZohoKey(stored: string): ZohoKey {
  const [dc, organizationId, refreshToken, ...rest] = stored.split(":");
  if (
    rest.length ||
    !isDataCentre(dc) ||
    !ORGANIZATION.test(organizationId ?? "") ||
    !REFRESH_TOKEN.test(refreshToken ?? "")
  )
    throw new VerificationError("zoho.storedInvalid");
  return { dc, organizationId, refreshToken };
}

/** What the founder sees of a connection: the organization's name, and the token's last four. */
export function zohoHint(organizationName: string, refreshToken: string) {
  const name = organizationName.replace(/\s+/g, " ").trim().slice(0, 26) || "Zoho Billing";
  return `${name} · …${refreshToken.slice(-4)}`;
}

export function parseZohoKey(): ParsedKey {
  throw new VerificationError("zoho.pasteRefused");
}
