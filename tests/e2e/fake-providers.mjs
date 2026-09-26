// Minimal stand-in for the payment provider APIs and the exchange-rate API, for the tests only.
// Stripe is below; Paddle, Polar and Dodo Payments are in fake-billing.mjs, and a founder's
// website with its DNS in fake-site.mjs.
// Account "one" has MRR $104 from 3 paying customers: $29 monthly, a $600 yearly plan at 50% off
// forever, a past-due EUR 40 plan at 0.8 EUR per USD, and one usage-based item that is skipped.
// Its paid invoices give a month-end history of $29 for a year, plus $25 a month from the yearly
// plan for the last five months, and the EUR plan from this month: invoice MRR is $104 now and $54
// thirty days ago, so growth is +92.6%. A metered line and a one-off setup fee are not counted.
// Account "two" shares a subscription with "one", so connecting both must be refused. Its key has
// no invoice permission, so it verifies MRR without history. Account "three" charges EUR 36 on a
// multi-currency price whose default is USD 50, so MRR is $45; its key cannot read invoices.
import { createServer } from "node:http";
import { handleBilling } from "./fake-billing.mjs";
import { handleSite } from "./fake-site.mjs";

const PORT = Number(process.env.FAKE_PROVIDERS_PORT || 3011);
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
  rk_test_harborfixture0003: {
    active: [
      subscription("sub_fixture_5", "cus_5", "active", "eur", [price("price_multi", "usd", 5000)]),
    ],
    past_due: [],
  },
};
const prices = Object.fromEntries(
  [
    price("price_monthly", "usd", 2900),
    price("price_yearly", "usd", 60000, "year"),
    price("price_eur", "eur", 4000),
    price("price_metered", "usd", 5, "month", "metered"),
    { ...price("price_setup", "usd", 5000), recurring: null },
    price("price_multi", "usd", 5000),
  ].map((p) => [p.id, p]),
);
// Amounts in other currencies, returned only when a request expands them.
const currencyOptions = {
  price_multi: { eur: { unit_amount: 3600, unit_amount_decimal: "3600" } },
};

// Invoices are placed relative to the current time, as Stripe would have created them.
const DAY = 86_400;
const unix = (ms) => Math.floor(ms / 1000);
const line = (id, priceId, amount, currency, start, end, extra = {}) => ({
  id,
  object: "line_item",
  amount,
  currency,
  period: { start, end },
  discount_amounts: [],
  taxes: [],
  parent: {
    type: "subscription_item_details",
    subscription_item_details: { proration: false, subscription: extra.subscription ?? null },
    invoice_item_details: null,
  },
  pricing: { type: "price_details", price_details: { price: priceId } },
  ...extra.line,
});
function fixtureInvoices() {
  const now = new Date();
  const [y, m] = [now.getUTCFullYear(), now.getUTCMonth()];
  const invoices = [];
  // Monthly plan, billed on the 1st for the last 14 months.
  for (let k = 0; k < 14; k++) {
    const start = unix(Date.UTC(y, m - k, 1));
    const end = unix(Date.UTC(y, m - k + 1, 1));
    const lines = [
      line(`il_monthly_${k}`, "price_monthly", 2900, "usd", start, end, {
        subscription: "sub_fixture_1",
      }),
    ];
    if (k === 1)
      lines.push(
        line("il_metered", "price_metered", 137, "usd", start, end, {
          subscription: "sub_fixture_4",
        }),
      );
    invoices.push({
      id: `in_monthly_${k}`,
      created: start,
      lines: { data: lines, has_more: false },
    });
  }
  // Yearly plan at 50% off, started five months ago, with a setup fee on a second lines page.
  const yearlyStart = unix(Date.UTC(y, m - 5, now.getUTCDate()));
  invoices.push({
    id: "in_yearly",
    created: yearlyStart,
    lines: {
      data: [
        line("il_yearly", "price_yearly", 60000, "usd", yearlyStart, yearlyStart + 365 * DAY, {
          subscription: "sub_fixture_2",
          line: { discount_amounts: [{ amount: 30000, discount: "di_half" }] },
        }),
      ],
      has_more: true,
    },
    more: [
      line("il_setup", "price_setup", 5000, "usd", yearlyStart, yearlyStart, {
        line: {
          parent: {
            type: "invoice_item_details",
            invoice_item_details: { proration: false, subscription: null },
            subscription_item_details: null,
          },
        },
      }),
    ],
  });
  // EUR plan, started within the current month and less than 30 days ago.
  const eurStart = Math.max(unix(Date.now()) - 20 * DAY, unix(Date.UTC(y, m, 1)));
  invoices.push({
    id: "in_eur",
    created: eurStart,
    lines: {
      data: [
        line("il_eur", "price_eur", 4000, "eur", eurStart, unix(Date.UTC(y, m + 1, 1)), {
          subscription: "sub_fixture_3",
        }),
      ],
      has_more: false,
    },
  });
  return invoices;
}

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
  if (handleBilling(url, request, response)) return;
  if (handleSite(url, request, response)) return;
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
  if (url.pathname.startsWith("/v1/prices/") && key === "rk_test_harborfixture0003") {
    const priceId = url.pathname.slice("/v1/prices/".length);
    const expanded = url.searchParams.getAll("expand[]").includes("currency_options");
    if (!prices[priceId]) return send(response, 404, stripeError(`Unknown path ${url.pathname}`));
    return send(response, 200, {
      ...prices[priceId],
      ...(expanded ? { currency_options: currencyOptions[priceId] ?? {} } : {}),
    });
  }
  if (url.pathname.startsWith("/v1/invoices") || url.pathname.startsWith("/v1/prices/")) {
    if (key !== "rk_test_harborfixture0001")
      return send(
        response,
        403,
        stripeError("The provided key does not have the required permissions for this endpoint."),
      );
    const invoices = fixtureInvoices();
    if (url.pathname === "/v1/invoices") {
      if (url.searchParams.get("status") !== "paid")
        return send(response, 400, stripeError("Only paid invoices are expected."));
      const since = Number(url.searchParams.get("created[gte]"));
      const data = invoices
        .filter((invoice) => invoice.created >= since)
        // The second lines page is only served by the lines endpoint.
        .map((invoice) => ({ ...invoice, more: undefined }));
      return send(response, 200, { object: "list", has_more: false, data });
    }
    const lines = url.pathname.match(new RegExp("^/v1/invoices/([^/]+)/lines$"));
    const invoice = lines && invoices.find((i) => i.id === lines[1]);
    if (invoice)
      return send(response, 200, {
        object: "list",
        has_more: false,
        data: [...invoice.lines.data, ...(invoice.more ?? [])],
      });
    const priceId = url.pathname.slice("/v1/prices/".length);
    if (prices[priceId]) return send(response, 200, prices[priceId]);
    return send(response, 404, stripeError(`Unknown path ${url.pathname}`));
  }
  const coupon = url.pathname.match(/^\/v1\/coupons\/(.+)$/);
  if (coupon && coupons[coupon[1]]) return send(response, 200, coupons[coupon[1]]);
  return send(response, 404, stripeError(`Unknown path ${url.pathname}`));
}).listen(PORT, "127.0.0.1");
