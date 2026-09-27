// Validation of Chargebee API keys and the site they belong to, pasted by makers. Chargebee does
// not say through its API what kind of key it is, so the editor asks for a read-only key. A test
// site's name ends in -test.
import { joinAccountKey } from "../account-key";
import { VerificationError } from "../errors";
import type { KeyInput, ParsedKey } from "../types";

/** The site name from a name or an address such as https://acme.chargebee.com/dashboard. */
export function parseChargebeeSite(input: string) {
  const site = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/\.chargebee\.com$/, "");
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(site))
    throw new VerificationError(
      "Enter your Chargebee site: the name before .chargebee.com in your dashboard's address.",
    );
  return site;
}

export function parseChargebeeKey(
  { key: input, account }: KeyInput,
  { allowTest }: { allowTest: boolean },
): ParsedKey {
  const site = parseChargebeeSite(account);
  const key = input.trim();
  if (/^(rk|sk|pk)_(live|test)_|^pdl_|^polar_|^creem_/.test(key))
    throw new VerificationError(
      "This key belongs to another payment provider. Paste your Chargebee API key.",
    );
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key))
    throw new VerificationError("Paste a Chargebee API key.");
  const livemode = !site.endsWith("-test");
  if (!livemode && !allowTest)
    throw new VerificationError("Use your live Chargebee site. Test sites are not accepted.");
  return {
    key: joinAccountKey(site, key),
    livemode,
    hint: `${site.slice(0, 26)} · …${key.slice(-4)}`,
  };
}
