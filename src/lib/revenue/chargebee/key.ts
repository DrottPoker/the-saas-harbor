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
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(site)) throw new VerificationError("chargebee.siteFormat");
  return site;
}

export function parseChargebeeKey(
  { key: input, account }: KeyInput,
  { allowTest }: { allowTest: boolean },
): ParsedKey {
  const site = parseChargebeeSite(account);
  const key = input.trim();
  if (/^(rk|sk|pk)_(live|test)_|^pdl_|^polar_|^creem_/.test(key))
    throw new VerificationError("common.otherProviderKey", { provider: "Chargebee" });
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new VerificationError("chargebee.keyFormat");
  const livemode = !site.endsWith("-test");
  if (!livemode && !allowTest) throw new VerificationError("chargebee.testSite");
  return {
    key: joinAccountKey(site, key),
    livemode,
    hint: `${site.slice(0, 26)} · …${key.slice(-4)}`,
  };
}
