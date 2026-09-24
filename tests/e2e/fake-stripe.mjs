// Minimal stand-in for the Stripe API and the exchange-rate API, for the browser tests only.
// Account "one" has MRR $104 from 3 paying customers: $29 monthly, a $600 yearly plan at 50% off
// forever, a past-due EUR 40 plan at 0.8 EUR per USD, and one usage-based item that is skipped.
// Account "two" shares a subscription with "one", so connecting both must be refused.
import { createServer } from "node:http";

const PORT = Number(process.env.FAKE_STRIPE_PORT || 3011);
const VERSION = "2026-08-26.dahlia";

const price = (id, currency, amount, interval = "month", usage = "licensed") => ({
  id,
  currency,
  unit_amount: amount,
  unit_amount_decimal: String(amount),
  billing_scheme: "per_unit",
  tiers_mode: null,
  recurring: { interval, interval_count: 1, usage_type: usage },
  transform_quantity: null,
});
const subscription = (id, customer, status, currency, items, discounts = []) => ({
  id,
  object: "subscription",
  status,
  customer,
  currency,
  pause_collection: null,
  discounts,
  items: {
    has_more: false,
    data: items.map((p, i) => ({ id: `si_${id}_${i}`, price: p, quantity: 1, discounts: [] })),
  },
});
const half = {
  id: "di_half",
  start: 1_600_000_000,
  end: null,
  source: { type: "coupon", coupon: "half" },
};

const accounts = {
  rk_test_harborfixture0001: {
    active: [
      subscription("sub_fixture_1", "cus_1", "active", "usd", [
        price("price_monthly", "usd", 2900),
      ]),
      subscription(
        "sub_fixture_2",
        "cus_2",
        "active",
        "usd",
        [price("price_yearly", "usd", 60000, "year")],
        [half],
      ),
      subscription("sub_fixture_4", "cus_4", "active", "usd", [
        price("price_metered", "usd", 5, "month", "metered"),
      ]),
    ],
    past_due: [
      subscription("sub_fixture_3", "cus_3", "past_due", "eur", [price("price_eur", "eur", 4000)]),
    ],
  },
  rk_test_harborfixture0002: {
    active: [
      subscription("sub_fixture_1", "cus_1", "active", "usd", [
        price("price_monthly", "usd", 2900),
      ]),
    ],
    past_due: [],
  },
};
const coupons = {
  half: { id: "half", amount_off: null, currency: null, percent_off: 50, duration: "forever" },
};

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
const stripeError = (message) => ({ error: { type: "invalid_request_error", message } });

createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === "/health") return send(response, 200, { ok: true });
  if (url.pathname === "/v2/rates") {
    const quotes = (url.searchParams.get("quotes") ?? "").split(",").filter(Boolean);
    const rates = { eur: 0.8 };
    return send(
      response,
      200,
      quotes.map((quote) => ({
        date: "2026-09-24",
        base: "USD",
        quote: quote.toUpperCase(),
        rate: rates[quote],
      })),
    );
  }
  if (request.headers["stripe-version"] !== VERSION)
    return send(response, 400, stripeError("Requests must pin the Stripe API version."));
  const key = (request.headers.authorization ?? "").replace(/^Bearer /, "");
  if (key === "rk_test_harbornoperm00001")
    return send(
      response,
      403,
      stripeError("The provided key does not have the required permissions for this endpoint."),
    );
  const account = accounts[key];
  if (!account) return send(response, 401, stripeError("Invalid API Key provided."));

  if (url.pathname === "/v1/subscriptions") {
    const status = url.searchParams.get("status");
    const expand = url.searchParams.getAll("expand[]");
    if (!expand.includes("data.discounts"))
      return send(response, 400, stripeError("Discounts must be expanded."));
    return send(response, 200, { object: "list", has_more: false, data: account[status] ?? [] });
  }
  const coupon = url.pathname.match(/^\/v1\/coupons\/(.+)$/);
  if (coupon && coupons[coupon[1]]) return send(response, 200, coupons[coupon[1]]);
  return send(response, 404, stripeError(`Unknown path ${url.pathname}`));
}).listen(PORT, "127.0.0.1");
