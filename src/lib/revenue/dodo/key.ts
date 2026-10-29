// Validation of Dodo Payments API keys pasted by makers. Dodo documents no key format, so only
// keys that plainly belong to another provider, or that no key could look like, are refused.
import { VerificationError } from "../errors";
import type { ParsedKey } from "../types";

export function parseDodoKey(input: string): ParsedKey {
  const key = input.trim();
  if (/^(rk|sk|pk)_(live|test)_|^pdl_|^polar_|^creem_/.test(key))
    throw new VerificationError("common.otherProviderKey", { provider: "Dodo Payments" });
  if (!/^[A-Za-z0-9._-]{16,256}$/.test(key)) throw new VerificationError("dodo.keyFormat");
  return { key, livemode: null, hint: `…${key.slice(-4)}` };
}
