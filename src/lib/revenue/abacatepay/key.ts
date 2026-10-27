// Validation of AbacatePay Trust MRR tokens pasted by makers. The Trust MRR app in the AbacatePay
// dashboard makes a token that starts with mrr_ and reaches the Public MRR routes only, so it can
// only read. AbacatePay's API keys (abc_dev_ and abc_prod_) reach the whole account and are refused.
// AbacatePay documents nothing else about the token's format, nor whether it can tell a token made
// in test mode, so every token counts as live.
import { VerificationError } from "../errors";
import type { ParsedKey } from "../types";

export function parseAbacatePayKey(input: string): ParsedKey {
  const key = input.trim();
  if (/^abc_(dev|prod)_/.test(key))
    throw new VerificationError(
      "This is an AbacatePay API key, which can do more than read. Turn on the Trust MRR app in your dashboard's Apps and paste its token, which starts with mrr_.",
    );
  if (/^pk_(?!(live|test)_)/.test(key))
    throw new VerificationError(
      "This is AbacatePay's public key. Paste the token of the Trust MRR app, which starts with mrr_.",
    );
  if (/^(rk|sk|pk)_(live|test)_|^pdl_|^polar_|^creem_|^apik_|^\$?aact_/.test(key))
    throw new VerificationError(
      "This key belongs to another payment provider. Paste your AbacatePay Trust MRR token.",
    );
  if (!/^mrr_[A-Za-z0-9._-]{8,256}$/.test(key))
    throw new VerificationError(
      "Paste the token of AbacatePay's Trust MRR app. It starts with mrr_.",
    );
  return { key, livemode: true, hint: `mrr_…${key.slice(-4)}` };
}
