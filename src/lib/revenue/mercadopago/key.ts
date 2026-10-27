// The stored form of a Mercado Pago connection. Founders connect through OAuth, so nothing pasted
// is accepted: Mercado Pago's own access tokens can do anything on the account. A connection holds
// an access token that lasts 180 days and a refresh token that renews it once, after which only the
// new pair works, so both are stored together with the access token's expiry and the account:
//
//   1:<expires at, Unix seconds>:<user id>:<access token>:<refresh token>
//
// The 1 is the format's version. Tokens hold letters, digits, - and _, never a colon.
import { VerificationError } from "../errors";
import type { ParsedKey } from "../types";

export type MercadoPagoKey = {
  accessToken: string;
  refreshToken: string;
  /** When the access token expires, in Unix seconds. */
  expiresAt: number;
  /** The seller's Mercado Pago user id, digits only. */
  userId: string;
};

const TOKEN = /^[A-Za-z0-9_-]{8,512}$/;
const NUMBER = /^\d{1,20}$/;

export function parseMercadoPagoKey(): ParsedKey {
  throw new VerificationError(
    "Connect Mercado Pago with the Connect with Mercado Pago button. Mercado Pago's access tokens can change your account, so they are not accepted here.",
  );
}

export function encodeMercadoPagoKey(key: MercadoPagoKey) {
  const valid =
    TOKEN.test(key.accessToken) &&
    TOKEN.test(key.refreshToken) &&
    Number.isSafeInteger(key.expiresAt) &&
    key.expiresAt > 0 &&
    NUMBER.test(key.userId);
  if (!valid)
    throw new VerificationError("Mercado Pago did not complete the connection. Try again.");
  return `1:${key.expiresAt}:${key.userId}:${key.accessToken}:${key.refreshToken}`;
}

export function decodeMercadoPagoKey(stored: string): MercadoPagoKey {
  const [version, expires, userId, accessToken, refreshToken, ...rest] = stored.split(":");
  if (
    version !== "1" ||
    rest.length ||
    !NUMBER.test(expires ?? "") ||
    !NUMBER.test(userId ?? "") ||
    !TOKEN.test(accessToken ?? "") ||
    !TOKEN.test(refreshToken ?? "")
  )
    throw new VerificationError(
      "The Mercado Pago connection could not be read. Connect Mercado Pago again.",
    );
  return { accessToken, refreshToken, expiresAt: Number(expires), userId };
}

/** The account's user id, which stays the same when the tokens are renewed. */
export function mercadoPagoHint(userId: string) {
  return `…${userId.slice(-4)}`;
}
