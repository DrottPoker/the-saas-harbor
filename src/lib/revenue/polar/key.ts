// Validation of Polar organization access tokens pasted by makers. Sandbox and production tokens
// look alike, so the environment is found when the token is first used.
import { VerificationError } from "../errors";
import type { ParsedKey } from "../types";

export function parsePolarToken(input: string): ParsedKey {
  const key = input.trim();
  if (/^polar_(at|rt|cst|mst)_/.test(key))
    throw new VerificationError(
      "Use an organization access token from your Polar settings. It starts with polar_oat_.",
    );
  if (!/^polar_oat_[A-Za-z0-9]{20,100}$/.test(key))
    throw new VerificationError(
      "Paste a Polar organization access token. It starts with polar_oat_.",
    );
  return { key, livemode: null, hint: `polar_oat_…${key.slice(-4)}` };
}
