// Validation of Creem API keys pasted by makers. Live keys start with creem_ and test keys with
// creem_test_. Creem does not say which scopes a key has, so the editor asks for a key with read
// scopes only.
import { VerificationError } from "../errors";
import type { ParsedKey } from "../types";

export function parseCreemKey(input: string, { allowTest }: { allowTest: boolean }): ParsedKey {
  const key = input.trim();
  const match = /^creem_(test_)?[A-Za-z0-9_-]{8,200}$/.exec(key);
  if (!match) throw new VerificationError("creem.keyFormat");
  const livemode = !match[1];
  if (!livemode && !allowTest)
    throw new VerificationError("common.liveKeyOnly", { provider: "Creem" });
  return { key, livemode, hint: `${livemode ? "creem_" : "creem_test_"}…${key.slice(-4)}` };
}
