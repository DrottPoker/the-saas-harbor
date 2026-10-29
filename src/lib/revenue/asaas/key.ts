// Validation of Asaas API keys pasted by makers. Production keys start with $aact_prod_ and
// sandbox keys with $aact_hmlg_; keys made before Asaas added the environment start with $aact_
// alone, and the first verification finds out where they belong. The $ is part of the key, so a
// key pasted without it gets it back. Whether the key can only read is checked with Asaas.
import { VerificationError } from "../errors";
import type { ParsedKey } from "../types";

export function parseAsaasKey(input: string, { allowTest }: { allowTest: boolean }): ParsedKey {
  const pasted = input.trim();
  const key = pasted.startsWith("aact_") ? `$${pasted}` : pasted;
  if (/^(rk|sk|pk)_(live|test)_|^pdl_|^polar_|^creem_|^apik_|^abc_(dev|prod)_|^mrr_/.test(key))
    throw new VerificationError("common.otherProviderKey", { provider: "Asaas" });
  // The rest of a key is Base64.
  const match = /^\$aact_(prod_|hmlg_)?[A-Za-z0-9+/=_-]{20,400}$/.exec(key);
  if (!match) throw new VerificationError("asaas.keyFormat");
  const livemode = match[1] === "hmlg_" ? false : match[1] === "prod_" ? true : null;
  if (livemode === false && !allowTest) throw new VerificationError("asaas.sandboxKey");
  return { key, livemode, hint: `${key.slice(0, match[1] ? 11 : 6)}…${key.slice(-4)}` };
}
