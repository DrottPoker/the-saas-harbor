// Validation of AbacatePay Trust MRR tokens pasted by makers. The Trust MRR app in the AbacatePay
// dashboard makes a token that starts with mrr_ and reaches the Public MRR routes only, so it can
// only read. AbacatePay's API keys (abc_dev_ and abc_prod_) reach the whole account and are refused.
// AbacatePay documents nothing else about the token's format, nor whether it can tell a token made
// in test mode, so every token counts as live.
import { VerificationError } from "../errors";
import type { ParsedKey } from "../types";

export function parseAbacatePayKey(input: string): ParsedKey {
  const key = input.trim();
  if (/^abc_(dev|prod)_/.test(key)) throw new VerificationError("abacatepay.apiKey");
  if (/^pk_(?!(live|test)_)/.test(key)) throw new VerificationError("abacatepay.publicKey");
  if (/^(rk|sk|pk)_(live|test)_|^pdl_|^polar_|^creem_|^apik_|^\$?aact_/.test(key))
    throw new VerificationError("abacatepay.otherProvider");
  if (!/^mrr_[A-Za-z0-9._-]{8,256}$/.test(key))
    throw new VerificationError("abacatepay.tokenFormat");
  return { key, livemode: true, hint: `mrr_…${key.slice(-4)}` };
}
