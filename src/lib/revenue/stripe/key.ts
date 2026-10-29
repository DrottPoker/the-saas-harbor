// Validation of Stripe keys pasted by makers. Only restricted keys are accepted.

import { VerificationError } from "../errors";

// The browser imports these from `./permissions`, which holds no server messages.
export { STRIPE_KEY_PERMISSIONS, stripeKeyCreationUrl } from "./permissions";

export type RestrictedKey = { key: string; livemode: boolean; hint: string };

export function parseRestrictedKey(
  input: string,
  { allowTest }: { allowTest: boolean },
): RestrictedKey {
  const key = input.trim();
  if (/^(sk|pk)_(live|test)_/.test(key)) throw new VerificationError("stripe.wrongKeyType");
  const match = /^rk_(live|test)_[A-Za-z0-9]{10,250}$/.exec(key);
  if (!match) throw new VerificationError("stripe.keyFormat");
  const livemode = match[1] === "live";
  if (!livemode && !allowTest) throw new VerificationError("stripe.liveModeOnly");
  return { key, livemode, hint: `rk_${match[1]}_…${key.slice(-4)}` };
}
