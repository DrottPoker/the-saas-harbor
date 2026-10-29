// Validation of Paystack restricted keys pasted by makers. A restricted key calls only the
// endpoints its scopes allow; one made in test mode starts with rk_test_, and one made in live
// mode is taken to start with rk_live_ like Paystack's other live keys. Secret keys (sk_) call
// every endpoint and public keys (pk_) only start payments, so both are refused. Paystack documents
// no way to read a key's scopes, and a write scope only shows on a request that writes, which is
// never sent, so the editor asks for the read scopes below and nothing else.
import { VerificationError } from "../errors";
import type { ParsedKey } from "../types";

/** The read scopes verification needs: subscriptions and plans, transactions, and refunds. */
export const PAYSTACK_SCOPES = [
  "plans:read",
  "transactions:read",
  "disputes_refunds:read",
] as const;

export function parsePaystackKey(input: string, { allowTest }: { allowTest: boolean }): ParsedKey {
  const key = input.trim();
  if (/^sk_(live|test)_/.test(key)) throw new VerificationError("paystack.secretKey");
  if (/^pk_(live|test)_/.test(key)) throw new VerificationError("paystack.publicKey");
  if (/^pdl_|^polar_|^creem_|^apik_/.test(key))
    throw new VerificationError("paystack.otherProvider");
  if (!/^rk_[A-Za-z0-9_-]{16,200}$/.test(key)) throw new VerificationError("paystack.keyFormat");
  // Paystack documents rk_test_ for test mode only, so any other restricted key counts as live.
  const livemode = !key.startsWith("rk_test_");
  if (!livemode && !allowTest)
    throw new VerificationError("common.liveKeyOnly", { provider: "Paystack" });
  const prefix = /^rk_(live|test)_/.exec(key)?.[0] ?? "rk_";
  return { key, livemode, hint: `${prefix}…${key.slice(-4)}` };
}
