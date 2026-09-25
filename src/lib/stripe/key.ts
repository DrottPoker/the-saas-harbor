// Validation of Stripe keys pasted by makers. Only restricted keys are accepted.

import { VerificationError } from "./errors";

export type RestrictedKey = { key: string; livemode: boolean; hint: string };

export function parseRestrictedKey(
  input: string,
  { allowTest }: { allowTest: boolean },
): RestrictedKey {
  const key = input.trim();
  if (/^(sk|pk)_(live|test)_/.test(key))
    throw new VerificationError(
      "Use a restricted key (rk_...) with read-only permissions, never your secret or publishable key.",
    );
  const match = /^rk_(live|test)_[A-Za-z0-9]{10,250}$/.exec(key);
  if (!match)
    throw new VerificationError("Paste a Stripe restricted key. It starts with rk_live_.");
  const livemode = match[1] === "live";
  if (!livemode && !allowTest)
    throw new VerificationError("Use a live-mode key. Test keys are not accepted.");
  return { key, livemode, hint: `rk_${match[1]}_…${key.slice(-4)}` };
}
