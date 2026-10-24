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
  if (!CREDENTIAL.test(clientId))
    throw new VerificationError("Enter the Client ID of your PayPal app.");
  if (/^(rk|sk|pk)_(live|test)_|^pdl_|^polar_|^creem_|^apik_/.test(secret))
    throw new VerificationError(
      "This key belongs to another payment provider. Paste the secret of your PayPal app.",
    );
  if (!CREDENTIAL.test(secret)) throw new VerificationError("Paste the secret of your PayPal app.");
  if (secret === clientId)
    throw new VerificationError(
      "The secret is the Client ID again. Paste Secret key 1 of the app.",
    );
  return {
    key: joinAccountKey(clientId, secret),
    livemode: null,
    hint: `${clientId.slice(0, 8)}… · …${secret.slice(-4)}`,
  };
}
