// Validation of Whop account API keys pasted by makers. Whop documents no key format, and sandbox
// and production keys look alike, so only keys that plainly belong to another provider, or that no
// key could look like, are refused. Whether the key can only read is checked with Whop.
import { VerificationError } from "../errors";
import type { ParsedKey } from "../types";

export function parseWhopKey(input: string): ParsedKey {
  const key = input.trim();
  if (/^(rk|sk|pk)_(live|test)_|^pdl_|^polar_|^creem_/.test(key))
    throw new VerificationError(
      "This key belongs to another payment provider. Paste your Whop API key.",
    );
  if (!/^[A-Za-z0-9._-]{20,300}$/.test(key)) throw new VerificationError("Paste a Whop API key.");
  return { key, livemode: null, hint: `…${key.slice(-4)}` };
}
