// Validation of Paddle Billing API keys pasted by makers. Only keys with permissions are
// accepted: legacy keys have full access to the account.
import { VerificationError } from "../errors";
import type { ParsedKey } from "../types";

const KEY = /^pdl_(live|sdbx)_apikey_[a-z0-9]{26}_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{3}$/;

export function parsePaddleKey(input: string, { allowTest }: { allowTest: boolean }): ParsedKey {
  const key = input.trim();
  if (/^[a-z0-9]{50}$/.test(key))
    throw new VerificationError(
      "This is a legacy Paddle key with full access to your account. Create a new API key with read permissions instead.",
    );
  const match = KEY.exec(key);
  if (!match)
    throw new VerificationError("Paste a Paddle API key. It starts with pdl_live_apikey_.");
  const livemode = match[1] === "live";
  if (!livemode && !allowTest)
    throw new VerificationError("Use a live Paddle key. Sandbox keys are not accepted.");
  return { key, livemode, hint: `pdl_${match[1]}_apikey_…${key.slice(-4)}` };
}
