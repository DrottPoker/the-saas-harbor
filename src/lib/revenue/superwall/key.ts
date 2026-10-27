// Validation of Superwall organization API keys and the app they verify, pasted by makers. An
// organization key starts with sk_; the app's public SDK key starts with pk_ and cannot read
// charts. Superwall's charts read one app at a time, by its application ID. Verification needs only
// the charts:read scope; that the key cannot read anything else is checked with Superwall.
import { joinAccountKey } from "../account-key";
import { VerificationError } from "../errors";
import type { KeyInput, ParsedKey } from "../types";

/**
 * The application ID, or the one in a pasted dashboard address: app.superwall.com/<organization
 * ID>/<application ID>/..., or superwall.com/applications/<application ID>/... in the older
 * dashboard.
 */
export function parseSuperwallApplication(input: string) {
  const value = input.trim();
  const application =
    /app\.superwall\.com\/\d+\/(\d+)(?:[/?#]|$)/.exec(value)?.[1] ??
    /superwall\.com\/applications\/(\d+)(?:[/?#]|$)/.exec(value)?.[1] ??
    value;
  if (!/^\d{1,20}$/.test(application))
    throw new VerificationError(
      "Enter your Superwall application ID, or paste the address of your app's dashboard.",
    );
  return application;
}

export function parseSuperwallKey({ key: input, account }: KeyInput): ParsedKey {
  const application = parseSuperwallApplication(account);
  const key = input.trim();
  if (/^pk_/.test(key))
    throw new VerificationError(
      "This is the app's public SDK key. Create an organization API key under Settings, API Keys.",
    );
  if (/^(rk|sk|pk)_(live|test)_|^pdl_|^polar_|^creem_|^apik_/.test(key))
    throw new VerificationError(
      "This key belongs to another payment provider. Paste your Superwall organization API key.",
    );
  if (!/^sk_[A-Za-z0-9_-]{16,200}$/.test(key))
    throw new VerificationError("Paste a Superwall organization API key. It starts with sk_.");
  return {
    key: joinAccountKey(application, key),
    // The charts are read for production purchases only.
    livemode: true,
    hint: `app ${application} · sk_…${key.slice(-4)}`,
  };
}
