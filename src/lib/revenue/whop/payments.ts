// Revenue from Whop payments. Pure functions: no I/O, fully testable.
// Every paid payment counts, a membership's or a one-time purchase. It earns its total without
// tax, less what was refunded of it without tax, and nothing once a dispute is lost, which Whop
// does not record as a refund. Amounts are in major units.
import { unixSeconds } from "../history";
import { toMinorUnits } from "../money";
import { netOf } from "../payments";
import type { ListedPayment } from "../types";
import type { WhopMoney, WhopPayment } from "./mrr";

const LOST = new Set(["dispute_lost", "resolution_lost"]);

const minor = (money: WhopMoney | undefined) =>
  money ? toMinorUnits(money.amount, money.currency) : 0;

export function whopEarned(payment: WhopPayment) {
  if (LOST.has(payment.substatus ?? "")) return 0;
  const untaxed = minor(payment.total) - minor(payment.tax_amount);
  const refunded = minor(payment.refunded_amount) - minor(payment.tax_refunded_amount);
  return netOf(untaxed, refunded);
}

export function whopPayments(payments: WhopPayment[]): ListedPayment[] {
  return payments.flatMap((payment) => {
    const at = unixSeconds(payment.created_at);
    if (at === null || !payment.total) return [];
    return [
      {
        id: payment.id,
        at,
        fingerprint: `${payment.substatus ?? ""}:${payment.refunded_amount?.amount ?? 0}`,
        value: { currency: payment.total.currency, amount: whopEarned(payment) },
      },
    ];
  });
}
