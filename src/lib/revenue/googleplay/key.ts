// Validation of a Google Play connection, pasted by makers: the Cloud Storage bucket that holds
// the developer account's reports, asked for as the account; the package names of the product's
// apps, since the reports cover every app of the account; and a JSON key of a service account
// that Play Console lets view financial data, asked for as the key.
//
// Stored as `<bucket>:<packages, comma separated>:<JSON>`, where the JSON holds what a token
// request needs: the service account's email, the key's id, and the RSA key as its public
// exponent and two primes, from which the signing key is rebuilt. A whole private key in PEM
// would not fit the 2,048 characters a stored key may take once encrypted.
import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { joinAccountKey, splitAccountKey } from "../account-key";
import { VerificationError } from "../errors";
import type { KeyInput, ParsedKey } from "../types";

/** A service account's signing key, ready for a token request. */
export type ServiceAccount = { email: string; keyId: string; privateKey: KeyObject };

/** A stored Google Play connection. */
export type GooglePlayConnection = {
  bucket: string;
  packages: string[];
  account: ServiceAccount;
};

/** The Play Console reports bucket, or the one in a pasted gs:// URI or Cloud Console address. */
export function parseGooglePlayBucket(input: string) {
  const value = input.trim();
  const named =
    /^gs:\/\/([^/\s]+)/i.exec(value)?.[1] ??
    /\/storage\/browser\/([^/?#\s]+)/.exec(value)?.[1] ??
    value.split("/")[0]!;
  const bucket = named.toLowerCase();
  if (!/^pubsite_prod_[a-z0-9_-]{4,50}$/.test(bucket))
    throw new VerificationError(
      "Enter the Cloud Storage URI of your reports, from Download reports in Play Console. It starts with gs://pubsite_prod_.",
    );
  return bucket;
}

const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
/** Apps one product may count, and how long their names may be together, so the key fits. */
const MAX_PACKAGES = 5;
const MAX_PACKAGES_LENGTH = 400;

/**
 * The package names of the product's apps, separated by commas or spaces, or taken from pasted
 * Play Store addresses (`...details?id=com.example.app`).
 */
export function parseGooglePlayPackages(input: string) {
  const names = input
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((value) => /[?&]id=([^&#\s]+)/.exec(value)?.[1] ?? value);
  const packages = [...new Set(names)];
  if (!packages.length || packages.some((name) => name.length > 150 || !PACKAGE.test(name)))
    throw new VerificationError(
      "Enter the package name of your app, such as com.example.app, as Play Console shows it under the app's name.",
    );
  if (packages.length > MAX_PACKAGES || packages.join(",").length > MAX_PACKAGES_LENGTH)
    throw new VerificationError(`Enter at most ${MAX_PACKAGES} package names.`);
  return packages;
}

const FULL_ACCESS =
  "This is a default service account, which can manage your Google Cloud project. Create a new service account without roles and paste a JSON key of that one.";

/**
 * Refuses the service accounts Google or Firebase create with broad access to the project: App
 * Engine's and Compute Engine's default accounts, which are editors, and the Firebase Admin SDK's.
 */
function requireOwnAccount(email: string) {
  if (
    /@appspot\.gserviceaccount\.com$/.test(email) ||
    /-compute@developer\.gserviceaccount\.com$/.test(email) ||
    /^firebase-adminsdk-[a-z0-9]+@/.test(email)
  )
    throw new VerificationError(FULL_ACCESS);
  if (!/^[a-z0-9-]{1,63}@[a-z0-9-]{1,63}\.iam\.gserviceaccount\.com$/.test(email))
    throw new VerificationError(
      "The JSON key does not name a service account. Paste the whole JSON key of a service account.",
    );
}

const WHOLE_KEY =
  "Paste the whole JSON key of the service account, as Google Cloud downloaded it. It starts with {.";

/** The service account in a pasted JSON key, with its RSA private key loaded. */
export function parseServiceAccountJson(input: string) {
  const value = input.trim();
  if (/^(rk|sk|pk)_(live|test)_|^pdl_|^polar_|^creem_|^apik_/.test(value))
    throw new VerificationError(
      "This key belongs to another payment provider. Paste the JSON key of your service account.",
    );
  if (/^AIza[0-9A-Za-z_-]{30,}$/.test(value))
    throw new VerificationError(
      "This is a Google API key. Paste the JSON key of a service account instead.",
    );
  if (value.includes("-----BEGIN") && !value.startsWith("{"))
    throw new VerificationError(
      "This is only the private key. Paste the whole JSON key file of the service account.",
    );
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    throw new VerificationError(WHOLE_KEY);
  }
  if (!json || typeof json !== "object") throw new VerificationError(WHOLE_KEY);
  const fields = json as Record<string, unknown>;
  if (fields.type === "authorized_user")
    throw new VerificationError(
      "These are a person's Google credentials, which can do anything they can. Paste a JSON key of a service account instead.",
    );
  if (fields.type !== "service_account") throw new VerificationError(WHOLE_KEY);
  const email = typeof fields.client_email === "string" ? fields.client_email.toLowerCase() : "";
  requireOwnAccount(email);
  const keyId = fields.private_key_id;
  if (typeof keyId !== "string" || !/^[A-Za-z0-9]{16,64}$/.test(keyId))
    throw new VerificationError(WHOLE_KEY);
  let privateKey: KeyObject;
  try {
    if (typeof fields.private_key !== "string") throw new Error();
    privateKey = createPrivateKey(fields.private_key);
  } catch {
    throw new VerificationError(
      "The private key in the JSON key could not be read. Download a new JSON key for the service account.",
    );
  }
  const bits = privateKey.asymmetricKeyDetails?.modulusLength ?? 0;
  if (privateKey.asymmetricKeyType !== "rsa" || bits < 2048 || bits > 4096)
    throw new VerificationError(
      "The JSON key does not hold an RSA key of 2048 to 4096 bits, as Google Cloud creates them. Download a new JSON key.",
    );
  return { email, keyId, privateKey };
}

// RSA arithmetic on unsigned big-endian base64url numbers, as JSON Web Keys write them.
const toBig = (value: string) =>
  BigInt(`0x${Buffer.from(value, "base64url").toString("hex") || "0"}`);
function fromBig(value: bigint) {
  const hex = value.toString(16);
  return Buffer.from(hex.length % 2 ? `0${hex}` : hex, "hex").toString("base64url");
}

function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** The inverse of `a` modulo `m`, by the extended Euclidean algorithm. */
function inverse(a: bigint, m: bigint) {
  let [oldR, r] = [a % m, m];
  let [oldS, s] = [1n, 0n];
  while (r) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
  }
  if (oldR !== 1n) throw new VerificationError(WHOLE_KEY);
  return ((oldS % m) + m) % m;
}

type Primes = { e: string; p: string; q: string };

/**
 * The private key from its public exponent and primes. The private exponent is the smallest one
 * (modulo the Carmichael function), which signs exactly as the original does.
 */
export function keyFromPrimes({ e, p, q }: Primes) {
  const [exponent, first, second] = [toBig(e), toBig(p), toBig(q)];
  const lambda = ((first - 1n) * (second - 1n)) / gcd(first - 1n, second - 1n);
  const d = inverse(exponent, lambda);
  return createPrivateKey({
    key: {
      kty: "RSA",
      n: fromBig(first * second),
      e,
      d: fromBig(d),
      p,
      q,
      dp: fromBig(d % (first - 1n)),
      dq: fromBig(d % (second - 1n)),
      qi: fromBig(inverse(second, first)),
    },
    format: "jwk",
  });
}

function primesOf(privateKey: KeyObject): Primes {
  const jwk = privateKey.export({ format: "jwk" });
  if (!jwk.e || !jwk.p || !jwk.q || !jwk.n) throw new VerificationError(WHOLE_KEY);
  const primes = { e: jwk.e, p: jwk.p, q: jwk.q };
  // A key whose primes do not give its own modulus is not one Google Cloud made.
  if (keyFromPrimes(primes).export({ format: "jwk" }).n !== jwk.n)
    throw new VerificationError(WHOLE_KEY);
  return primes;
}

/** At most this many characters keep the encrypted key within the 2,048 it may take. */
const MAX_STORED_LENGTH = 1400;

export function parseGooglePlayKey({ key: input, account, extra }: KeyInput): ParsedKey {
  const bucket = parseGooglePlayBucket(account);
  const packages = parseGooglePlayPackages(extra?.[0] ?? "");
  const { email, keyId, privateKey } = parseServiceAccountJson(input);
  const stored = joinAccountKey(
    bucket,
    joinAccountKey(
      packages.join(","),
      JSON.stringify({ email, id: keyId, ...primesOf(privateKey) }),
    ),
  );
  if (stored.length > MAX_STORED_LENGTH)
    throw new VerificationError(
      "The JSON key and package names are too long to store. Use fewer package names.",
    );
  const label = packages.length > 1 ? `${packages[0]} +${packages.length - 1}` : packages[0]!;
  return {
    key: stored,
    // Play Console's reports have no test mode: license testers' purchases are not charged.
    livemode: true,
    hint: `${label.length > 30 ? `${label.slice(0, 29)}…` : label} · …${keyId.slice(-4)}`,
  };
}

/** A stored connection, with the signing key rebuilt. */
export function storedConnection(stored: string): GooglePlayConnection {
  const { account: bucket, key: rest } = splitAccountKey(stored);
  const { account: packages, key: json } = splitAccountKey(rest);
  try {
    const parts = JSON.parse(json) as { email: string; id: string } & Primes;
    return {
      bucket,
      packages: packages.split(","),
      account: { email: parts.email, keyId: parts.id, privateKey: keyFromPrimes(parts) },
    };
  } catch {
    throw new VerificationError(
      "The stored key is not readable. Connect the payment provider again.",
    );
  }
}

/**
 * A signed JWT that asks Google for an access token with `scope` (RS256, valid for an hour, the
 * longest Google accepts).
 */
export function signedAssertion(
  account: ServiceAccount,
  scope: string,
  audience: string,
  now: number,
) {
  const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString("base64url");
  const input = `${encode({ alg: "RS256", typ: "JWT", kid: account.keyId })}.${encode({
    iss: account.email,
    scope,
    aud: audience,
    iat: now,
    exp: now + 3600,
  })}`;
  return `${input}.${sign("sha256", Buffer.from(input), account.privateKey).toString("base64url")}`;
}
