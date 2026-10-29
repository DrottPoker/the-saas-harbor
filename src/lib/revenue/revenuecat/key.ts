// Validation of RevenueCat V2 secret API keys and the project they belong to, pasted by makers.
// A key belongs to one project. Verification needs only Charts & metrics access; that the key has
// no other access is checked with RevenueCat.
import { joinAccountKey } from "../account-key";
import { VerificationError } from "../errors";
import type { KeyInput, ParsedKey } from "../types";

/** The project ID, or the one in a pasted dashboard address such as .../projects/<id>/overview. */
export function parseRevenueCatProject(input: string) {
  const value = input.trim();
  const project = /\/projects\/([^/?#]+)/.exec(value)?.[1] ?? value;
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(project))
    throw new VerificationError("revenuecat.projectFormat");
  return project;
}

export function parseRevenueCatKey({ key: input, account }: KeyInput): ParsedKey {
  const project = parseRevenueCatProject(account);
  const key = input.trim();
  if (/^(appl|goog|amzn|strp|rcb|test)_/.test(key))
    throw new VerificationError("revenuecat.publicKey");
  if (/^(rk|sk|pk)_(live|test)_/.test(key)) throw new VerificationError("revenuecat.otherProvider");
  if (!/^sk_[A-Za-z0-9]{10,200}$/.test(key)) throw new VerificationError("revenuecat.keyFormat");
  return {
    key: joinAccountKey(project, key),
    // RevenueCat's charts count production purchases only.
    livemode: true,
    hint: `${project.slice(0, 24)} · sk_…${key.slice(-4)}`,
  };
}
