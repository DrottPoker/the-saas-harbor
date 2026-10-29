// Validation of Mollie advanced access tokens (organization access tokens), pasted by makers with
// the ID of the website profile they read. A token starts with access_ and holds the permissions
// chosen when it was made, which every verification checks with Mollie. API keys (live_ and test_)
// can do everything on their profile, creating payments and refunds included, so they are refused.
// One token reads live data, or test data on request, so test data is tried only where test keys
// are allowed.
import { joinAccountKey } from "../account-key";
import { VerificationError } from "../errors";
import type { KeyInput, ParsedKey } from "../types";

/** The profile ID, or the one in a pasted address or text that holds it. */
export function parseMollieProfile(input: string) {
  const profile = /pfl_[A-Za-z0-9]+/.exec(input.trim())?.[0];
  if (!profile || !/^pfl_[A-Za-z0-9]{4,64}$/.test(profile))
    throw new VerificationError("mollie.profileFormat");
  return profile;
}

export function parseMollieKey(
  { key: input, account }: KeyInput,
  { allowTest }: { allowTest: boolean },
): ParsedKey {
  const profile = parseMollieProfile(account);
  const token = input.trim();
  if (/^(rk|sk|pk)_(live|test)_|^pdl_|^polar_|^creem_|^apik_/.test(token))
    throw new VerificationError("mollie.otherProvider");
  if (/^(live|test)_/.test(token)) throw new VerificationError("mollie.apiKey");
  if (!/^access_[A-Za-z0-9]{16,200}$/.test(token))
    throw new VerificationError("mollie.tokenFormat");
  return {
    key: joinAccountKey(profile, token),
    // Only live data is read unless test keys are allowed; then the first verification finds it.
    livemode: allowTest ? null : true,
    hint: `${profile.slice(0, 24)} · access_…${token.slice(-4)}`,
  };
}
