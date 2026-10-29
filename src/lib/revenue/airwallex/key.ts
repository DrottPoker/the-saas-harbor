// Validation of an Airwallex scoped API key and its Client ID, pasted by makers: the Client ID is
// asked for as the account and the key as the key. Airwallex documents neither format, and
// production and sandbox credentials look alike, so the first verification finds the environment.
// Whether the key has more access than reading is checked with Airwallex where it can be.
import { joinAccountKey } from "../account-key";
import { VerificationError } from "../errors";
import type { KeyInput, ParsedKey } from "../types";

const CREDENTIAL = /^[A-Za-z0-9_-]{16,256}$/;

export function parseAirwallexKey({ key: input, account }: KeyInput): ParsedKey {
  const clientId = account.trim();
  const key = input.trim();
  if (!CREDENTIAL.test(clientId)) throw new VerificationError("airwallex.clientIdFormat");
  if (/^(rk|sk|pk)_|^pdl_|^polar_|^creem_|^apik_/.test(key))
    throw new VerificationError("airwallex.otherProvider");
  if (!CREDENTIAL.test(key)) throw new VerificationError("airwallex.keyFormat");
  if (key === clientId) throw new VerificationError("airwallex.keyIsClientId");
  return {
    key: joinAccountKey(clientId, key),
    livemode: null,
    hint: `${clientId.slice(0, 8)}… · …${key.slice(-4)}`,
  };
}
