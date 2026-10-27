// A stand-in for Airwallex's API, for the tests only, under /airwallex with /live or /sandbox for
// the environment, as the app's override expects. Both keys are sandbox keys, so the live address
// refuses them. Figures are placed relative to the current time, and EUR is 0.8 per USD.
//
// Key "one" is a scoped key that reads subscriptions, invoices and payments only. Its Billing
// subscriptions: $20 a month (with a metered item, which is skipped), $240 a year at 50% off for
// good ($10 a month), EUR 40 a month that is unpaid and still in its period ($50), one in trial,
// and $15 a month paid outside Airwallex (skipped). MRR is $80 from 3 subscribers, with 2 items or
// subscriptions not counted. Paid invoices give the history: $20 a month on the 1st for 14 months,
// and the yearly plan's $120 (with $12 of tax) four months ago, so the month-ends show $20 until
// the yearly plan starts and $30 since; MRR from the lines is $30 now and thirty days ago. The
// unpaid subscription has no paid invoice, and invoices marked paid outside Airwallex do not count.
//
// For revenue: a payment for each paid invoice ($20 each, kind subscription, and $132 for the
// yearly plan, which earns $120 without its tax), a $50 one-time payment ten days ago with $15
// refunded ($35), a $25 one refunded in full ($0), a failed refund that takes nothing, and a $99
// payment that never succeeded. Key "wide" is an admin key that can also read balances, and is
// refused.

export const AIRWALLEX = {
  one: { clientId: "harborAirwallexClient01", apiKey: "harborAirwallexKeyOne000000000001" },
  wide: { clientId: "harborAirwallexClient02", apiKey: "harborAirwallexKeyWide00000000001" },
};

const keys = [
  { ...AIRWALLEX.one, token: "airwallex_token_harbor_one", admin: false },
  { ...AIRWALLEX.wide, token: "airwallex_token_harbor_wide", admin: true },
];

const DAY = 86_400_000;
// Billing writes its offset without a colon, Payment Acceptance with one.
const billingTime = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "+0000");
const paTime = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "+00:00");
const parseTime = (value) => Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));

const price = (id, currency, amount, unit = "MONTH", extra = {}) => ({
  id,
  active: true,
  currency,
  pricing_model: "FLAT",
  flat_amount: amount,
  metered: false,
  type: "RECURRING",
  tax_included: false,
  recurring: { period: 1, period_unit: unit },
  product: { id: `prd_${id}`, name: id, unit: "license", active: true },
  product_id: `prd_${id}`,
  ...extra,
});

function account() {
  const now = new Date();
  const [y, m] = [now.getUTCFullYear(), now.getUTCMonth()];
  const d = Math.min(now.getUTCDate(), 28);
  const ago = (days) => Date.now() - days * DAY;
  const yearlyStart = Date.UTC(y, m - 4, d);
  const subscription = (id, status, currency, extra = {}) => ({
    id,
    status,
    currency,
    billing_customer_id: `bcus_${id}`,
    collection_method: "AUTO_CHARGE",
    cancel_at_period_end: false,
    created_at: billingTime(ago(400)),
    current_period_starts_at: billingTime(ago(20)),
    current_period_ends_at: billingTime(ago(-10)),
    recurring: { period: 1, period_unit: "MONTH" },
    applied_discounts: [],
    ...extra,
  });
  const half = {
    id: "disc_half",
    applied_to: "SUBSCRIPTION",
    discount_model: "PERCENTAGE",
    percentage_off: 50,
    duration_type: "INDEFINITELY",
    starts_at: billingTime(yearlyStart),
  };
  const subscriptions = [
    subscription("sub_monthly", "ACTIVE", "USD"),
    subscription("sub_yearly", "ACTIVE", "USD", {
      recurring: { period: 1, period_unit: "YEAR" },
      applied_discounts: [half],
    }),
    subscription("sub_eur", "UNPAID", "EUR"),
    subscription("sub_trial", "IN_TRIAL", "USD"),
    subscription("sub_outside", "ACTIVE", "USD", { collection_method: "OUT_OF_BAND" }),
  ];
  const item = (subscriptionId, id, p, extra = {}) => ({
    id,
    subscription_id: subscriptionId,
    quantity: 1,
    price: p,
    applied_discounts: [],
    ...extra,
  });
  const items = {
    sub_monthly: [
      item("sub_monthly", "sit_monthly", price("pri_monthly", "USD", 20)),
      item(
        "sub_monthly",
        "sit_metered",
        price("pri_metered", "USD", 0, "MONTH", {
          pricing_model: "PER_UNIT",
          flat_amount: undefined,
          unit_amount: 0.01,
          metered: true,
          billing_type: "IN_ARREARS",
        }),
        { quantity: undefined },
      ),
    ],
    sub_yearly: [item("sub_yearly", "sit_yearly", price("pri_yearly", "USD", 240, "YEAR"))],
    sub_eur: [item("sub_eur", "sit_eur", price("pri_eur", "EUR", 40))],
    sub_trial: [item("sub_trial", "sit_trial", price("pri_trial", "USD", 99))],
    sub_outside: [item("sub_outside", "sit_outside", price("pri_outside", "USD", 15))],
  };

  const invoices = [];
  const lines = {};
  const intents = [];
  const invoice = (id, subscriptionId, created, total, tax, lineList, extra = {}) => {
    invoices.push({
      id,
      status: "FINALIZED",
      payment_status: "PAID",
      currency: "USD",
      subscription_id: subscriptionId,
      billing_customer_id: `bcus_${subscriptionId}`,
      total_amount: total,
      total_tax_amount: tax,
      amount_due: 0,
      paid_out_of_band: false,
      created_at: billingTime(created),
      paid_at: billingTime(created),
      ...extra,
    });
    lines[id] = lineList.map((line, index) => ({
      id: `iit_${id}_${index}`,
      invoice_id: id,
      currency: "USD",
      discount_amounts: [],
      tax_amount: 0,
      quantity: 1,
      ...line,
    }));
    if (!extra.paid_out_of_band)
      intents.push({
        id: `int_${id}`,
        status: "SUCCEEDED",
        amount: total,
        captured_amount: total,
        currency: "USD",
        invoice_id: id,
        created_at: paTime(created),
      });
  };
  for (let k = 13; k >= 0; k--) {
    const start = Date.UTC(y, m - k, 1);
    invoice(`inv_monthly_${k}`, "sub_monthly", start, 20, 0, [
      {
        amount: 20,
        price: items.sub_monthly[0].price,
        period_starts_at: billingTime(start),
        period_ends_at: billingTime(Date.UTC(y, m - k + 1, 1)),
      },
    ]);
  }
  invoice("inv_yearly", "sub_yearly", yearlyStart, 132, 12, [
    {
      amount: 240,
      discount_amounts: [{ amount: 120, applied_discount_id: "disc_half" }],
      tax_amount: 12,
      price: items.sub_yearly[0].price,
      period_starts_at: billingTime(yearlyStart),
      period_ends_at: billingTime(Date.UTC(y, m + 8, d)),
    },
  ]);
  invoice(
    "inv_outside",
    "sub_outside",
    Date.UTC(y, m, 1),
    15,
    0,
    [
      {
        amount: 15,
        price: items.sub_outside[0].price,
        period_starts_at: billingTime(Date.UTC(y, m, 1)),
        period_ends_at: billingTime(Date.UTC(y, m + 1, 1)),
      },
    ],
    { paid_out_of_band: true },
  );
  const payment = (id, amount, days, status = "SUCCEEDED") => ({
    id,
    status,
    amount,
    captured_amount: status === "SUCCEEDED" ? amount : 0,
    currency: "USD",
    created_at: paTime(ago(days)),
  });
  intents.push(
    payment("int_checkout", 50, 10),
    payment("int_refunded", 25, 15),
    payment("int_abandoned", 99, 3, "REQUIRES_PAYMENT_METHOD"),
  );
  const refund = (id, intent, amount, days, status) => ({
    id,
    payment_intent_id: intent,
    amount,
    currency: "USD",
    status,
    created_at: paTime(ago(days)),
  });
  const refunds = [
    refund("rfd_partial", "int_checkout", 15, 8, "SETTLED"),
    refund("rfd_failed", "int_checkout", 5, 7, "FAILED"),
    refund("rfd_full", "int_refunded", 25, 14, "ACCEPTED"),
  ];
  return { subscriptions, items, invoices, lines, intents, refunds };
}

const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

/** Billing lists: a cursor that is the offset of the next page. */
function billingPage(url, items, send) {
  const size = Number(url.searchParams.get("page_size") ?? 20);
  const offset = Number(url.searchParams.get("page") ?? 0);
  if (!(size >= 1 && size <= 100) || !(offset >= 0))
    return send(400, { code: "validation_error", message: "Invalid page." });
  const next = offset + size < items.length ? String(offset + size) : null;
  return send(200, {
    items: items.slice(offset, offset + size),
    page_after: next,
    page_before: null,
  });
}

/** Payment Acceptance lists: numbered pages from 0. */
function paPage(url, items, send) {
  const size = Math.min(1000, Number(url.searchParams.get("page_size") ?? 10));
  const page = Number(url.searchParams.get("page_num") ?? 0);
  if (!(size >= 1) || !(page >= 0))
    return send(400, { code: "validation_error", message: "Invalid page." });
  return send(200, {
    items: items.slice(page * size, (page + 1) * size),
    has_more: (page + 1) * size < items.length,
  });
}

function inWindow(url, created) {
  const from = url.searchParams.get("from_created_at");
  const to = url.searchParams.get("to_created_at");
  for (const value of [from, to]) if (value && !TIME.test(value)) return null;
  const at = parseTime(created);
  return (!from || at >= parseTime(from)) && (!to || at <= parseTime(to));
}

export async function handleAirwallex(url, request, response) {
  if (!url.pathname.startsWith("/airwallex/")) return false;
  const send = (status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
    return true;
  };
  const [, , environment, ...rest] = url.pathname.split("/");
  const path = `/${rest.join("/")}`;
  const unauthorized = () =>
    send(401, { code: "credentials_invalid", message: "Access denied, authentication failed." });

  // Issuing a token is the one request that is not a GET.
  if (path === "/api/v1/authentication/login" && request.method === "POST") {
    const key = keys.find(
      (k) =>
        k.clientId === request.headers["x-client-id"] && k.apiKey === request.headers["x-api-key"],
    );
    if (!key || environment !== "sandbox") return unauthorized();
    return send(201, {
      token: key.token,
      expires_at: billingTime(Date.now() + 30 * 60_000),
    });
  }
  if (request.method !== "GET")
    return send(405, { code: "method_not_allowed", message: "Only reads are expected." });
  const key = keys.find((k) => request.headers.authorization === `Bearer ${k.token}`);
  if (!key || environment !== "sandbox") return unauthorized();
  const forbidden = () =>
    send(403, { code: "unauthorized", message: "Access denied. Insufficient permissions." });

  if (path === "/api/v1/balances/current")
    return key.admin ? send(200, [{ currency: "USD", available_amount: 1000 }]) : forbidden();
  if (path === "/api/v1/billing/products")
    return key.admin ? send(200, { items: [], page_after: null }) : forbidden();

  const data = account();
  if (path === "/api/v1/billing/subscriptions") {
    const status = url.searchParams.get("status");
    return billingPage(
      url,
      data.subscriptions.filter((s) => !status || s.status === status),
      send,
    );
  }
  const subscriptionItems = /^\/api\/v1\/billing\/subscriptions\/([^/]+)\/items$/.exec(path);
  if (subscriptionItems) {
    const items = data.items[decodeURIComponent(subscriptionItems[1])];
    if (!items) return send(404, { code: "resource_not_found", message: "No such subscription." });
    return billingPage(url, items, send);
  }
  if (path === "/api/v1/billing/invoices") {
    const status = url.searchParams.get("payment_status");
    const found = data.invoices.filter(
      (i) => (!status || i.payment_status === status) && inWindow(url, i.created_at),
    );
    return billingPage(url, found, send);
  }
  const invoiceLines = /^\/api\/v1\/billing\/invoices\/([^/]+)\/line_items$/.exec(path);
  if (invoiceLines) {
    const lines = data.lines[decodeURIComponent(invoiceLines[1])];
    if (!lines) return send(404, { code: "resource_not_found", message: "No such invoice." });
    return billingPage(url, lines, send);
  }
  if (path === "/api/v1/pa/payment_intents") {
    const status = url.searchParams.get("status");
    const found = data.intents.filter(
      (i) => (!status || i.status === status) && inWindow(url, i.created_at),
    );
    return paPage(url, found, send);
  }
  if (path === "/api/v1/pa/refunds")
    return paPage(
      url,
      data.refunds.filter((r) => inWindow(url, r.created_at)),
      send,
    );
  return send(404, { code: "not_found", message: `Unknown path ${path}` });
}
