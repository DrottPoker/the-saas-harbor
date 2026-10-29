// Validation of an App Store Connect API key, pasted by makers: the team's Issuer ID, asked for as
// the account, then the Key ID and the vendor number, and the private key from the .p8 file, asked
// for as the key. Only Team keys can download sales reports. Individual keys look the same, but
// sign their tokens without the Issuer ID, so Apple refuses them here. The key field is a password
// input, which drops line breaks, so the private key is accepted with or without them and with or
// without its BEGIN and END lines, and stored as PKCS#8 DER in base64. What the key may do is
// checked with Apple on every read (`requireReportsOnly` in `index.ts`).
//
// The stored key is `<issuer>:<key ID>:<vendor number>:<private key>`; no part contains a colon.
// Tokens are signed here, with no request to Apple: ES256 JWTs that live ten minutes and are
// scoped to the one request they are made for.
import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { joinAccountKey, splitAccountKey } from "../account-key";
import { VerificationError } from "../errors";
import type { KeyInput, ParsedKey } from "../types";

const ISSUER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY_ID = /^[A-Z0-9]{10}$/;
const VENDOR = /^[0-9]{6,12}$/;

export type AppStoreCredentials = {
  issuer: string;
  keyId: string;
  vendor: string;
  privateKey: KeyObject;
};

/**
 * The private key from a .p8 file: PKCS#8 for the P-256 curve, which App Store Connect API keys
 * are. Line breaks, spaces, escaped line breaks and the BEGIN and END lines are dropped first.
 */
export function parsePrivateKey(input: string): KeyObject {
  const body = input
    .replace(/\\n/g, "")
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]{40,}={0,2}$/.test(body)) throw new VerificationError("appstore.p8Format");
  let key: KeyObject;
  try {
    key = createPrivateKey({ key: Buffer.from(body, "base64"), format: "der", type: "pkcs8" });
  } catch {
    throw new VerificationError("appstore.privateKeyUnreadable");
  }
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1")
    throw new VerificationError("appstore.notTeamKey");
  return key;
}

export function parseAppStoreKey({ key: input, account, extra = [] }: KeyInput): ParsedKey {
  const issuer = account.trim().toLowerCase();
  if (!ISSUER.test(issuer)) throw new VerificationError("appstore.issuerFormat");
  const keyId = (extra[0] ?? "").trim().toUpperCase();
  if (!KEY_ID.test(keyId)) throw new VerificationError("appstore.keyIdFormat");
  const vendor = (extra[1] ?? "").trim();
  if (!VENDOR.test(vendor)) throw new VerificationError("appstore.vendorFormat");
  const pasted = input.trim();
  if (/^(rk|sk|pk)_(live|test)_|^pdl_|^polar_|^creem_|^apik_/.test(pasted))
    throw new VerificationError("appstore.otherProvider");
  if (KEY_ID.test(pasted.toUpperCase())) throw new VerificationError("appstore.keyIdPasted");
  const privateKey = parsePrivateKey(pasted);
  const der = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  return {
    key: joinAccountKey(issuer, `${keyId}:${vendor}:${der}`),
    // App Store Connect has no test environment for its reports.
    livemode: true,
    hint: `${keyId} · vendor ${vendor}`,
  };
}

/** The credentials in a stored key. */
export function appStoreCredentials(stored: string): AppStoreCredentials {
  const { account: issuer, key } = splitAccountKey(stored);
  const [keyId = "", vendor = "", der = ""] = key.split(":");
  return { issuer, keyId, vendor, privateKey: parsePrivateKey(der) };
}

/** A token's lifetime in seconds; Apple refuses tokens that live longer than 20 minutes. */
export const TOKEN_LIFETIME = 600;

const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

/**
 * A signed token for one request, such as `GET /v1/salesReports?filter[...]=...`. Apple accepts a
 * scoped token for that request only. It is dated a minute back, in case this clock runs ahead of
 * Apple's.
 */
export function appStoreToken(
  { issuer, keyId, privateKey }: AppStoreCredentials,
  scope: string,
  now = Date.now(),
) {
  const issued = Math.floor(now / 1000) - 60;
  const input = `${part({ alg: "ES256", kid: keyId, typ: "JWT" })}.${part({
    iss: issuer,
    iat: issued,
    exp: issued + TOKEN_LIFETIME,
    aud: "appstoreconnect-v1",
    scope: [scope],
  })}`;
  // JWTs carry the signature's two numbers side by side, not in DER.
  const signature = sign("sha256", Buffer.from(input), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${input}.${signature.toString("base64url")}`;
}
