// Revenue from Polar orders. Pure functions: no I/O, fully testable.
// Every paid order is a payment, a subscription's or a one-time purchase. It earns its net
// amount, which is after discounts and before tax, less what was refunded of it, which Polar
// counts without tax as well. An order of a subscription paid for it; any other was a purchase.
import { unixSeconds } from "../history";
import { netOf } from "../payments";
import type { ListedPayment } from "../types";
import type { PolarOrder } from "./mrr";

const subscriptionOrder = (order: PolarOrder) =>
  !!order.subscription_id || order.billing_reason.startsWith("subscription");

export function orderPayments(orders: PolarOrder[]): ListedPayment[] {
  return orders.flatMap((order) => {
    const at = unixSeconds(order.created_at);
    if (at === null) return [];
    const refunded = order.refunded_amount ?? 0;
    return [
      {
        id: order.id,
        at,
        fingerprint: `${order.net_amount}:${refunded}`,
        value: { currency: order.currency, amount: netOf(order.net_amount, refunded) },
        kind: subscriptionOrder(order) ? "subscription" : "one_time",
      },
    ];
  });
}
