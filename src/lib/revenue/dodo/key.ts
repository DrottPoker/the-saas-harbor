// Validation of Dodo Payments API keys pasted by makers. Dodo documents no key format, so only
// keys that plainly belong to another provider, or that no key could look like, are refused.
import { VerificationError } from "../errors";
import type { ParsedKey } from "../types";

export function parseDodoKey(input: string): ParsedKey {
  const key = input.trim();
  if (/^(rk|sk|pk)_(live|test)_|^pdl_|^polar_/.test(key))
    throw new VerificationError(
      "This key belongs to another payment provider. Paste your Dodo Payments API key.",
    );
  if (!/^[A-Za-z0-9._-]{16,256}$/.test(key))
    throw new VerificationError("Paste a Dodo Payments API key.");
  return { key, livemode: null, hint: `…${key.slice(-4)}` };
}
