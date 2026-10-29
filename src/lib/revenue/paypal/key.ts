// Validation of a PayPal app's credentials, pasted by makers: its Client ID, asked for as the
// account, and its secret, asked for as the key. PayPal documents no format; both are long runs of
// letters, digits, - and _. Neither says whether the app is live or in the sandbox, so the first
// verification finds out.
import { joinAccountKey } from "../account-key";
import { VerificationError } from "../errors";
import type { KeyInput, ParsedKey } from "../types";

const CREDENTIAL = /^[A-Za-z0-9_-]{20,128}$/;

export function parsePayPalKey({ key: input, account }: KeyInput): ParsedKey {
  const clientId = account.trim();
  const secret = input.trim();
  if (!CREDENTIAL.test(clientId)) throw new VerificationError("paypal.clientIdFormat");
  if (/^(rk|sk|pk)_(live|test)_|^pdl_|^polar_|^creem_|^apik_/.test(secret))
    throw new VerificationError("paypal.otherProvider");
  if (!CREDENTIAL.test(secret)) throw new VerificationError("paypal.secretFormat");
  if (secret === clientId) throw new VerificationError("paypal.secretIsClientId");
  return {
    key: joinAccountKey(clientId, secret),
    livemode: null,
    hint: `${clientId.slice(0, 8)}… · …${secret.slice(-4)}`,
  };
}
