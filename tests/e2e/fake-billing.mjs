// Stand-ins for the Paddle, Polar and Dodo Payments APIs, for the tests only. Each provider lives
// under its own prefix with /live or /test for the environment, as the app's overrides expect.
// Figures are placed relative to the current time, and EUR is 0.8 per USD.
//
// Paddle sandbox key "one": $30 a month (tax on top), a yearly $1,200 plan at 10% off for good
// ($90 a month), and a past-due EUR 50 plan whose last charge had a discount that has ended since
// ($62.50). A fourth subscription has no paid charge and is skipped: MRR $182.50 from 3 customers.
// Charges now give $120 and 30 days ago $170 (the EUR plan's last period covered that day).
// Paddle sandbox key "noperm" cannot read transactions.
//
// Polar sandbox token "one": $20 a month, a yearly plan whose 25% discount covers the first year
// only ($26.67 a month without it), and a past-due EUR 12 plan with 20% VAT included (EUR 10 net,
// $12.50): MRR $59.17 from 3 customers. Metered usage is billed but not counted. Orders give
// $52.50 now and $40 thirty days ago.
//
// Dodo Payments test key "one": $15 a month, $120 a year, and a past-due EUR 24 plan with tax
// included, whose latest payment shows EUR 4 of tax ($25). An on-demand subscription and one in its
// trial are not counted: MRR $50 from 3 customers, without history.
//
// For revenue, every transaction, order or payment counts after refunds and without tax. Paddle
// adds a one-time purchase refunded in full ($0) to the $99 one; Polar a one-time purchase of $15
// and one refunded in full; Dodo a one-time purchase of $30 with $5 of tax ($25), one refunded in
// full and one lost in a dispute ($0 each).

const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();

function monthStarts(count) {
  const now = new Date();
  return Array.from({ length: count }, (_, k) => [
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1),
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k + 1, 1),
  ]);
}

// Paddle ----------------------------------------------------------------------------------------

export const PADDLE_KEYS = {
  one: `pdl_sdbx_apikey_${"harborfixture1".padEnd(26, "0")}_${"Fixture".padEnd(22, "0")}_001`,
  noperm: `pdl_sdbx_apikey_${"harbornoperm1".padEnd(26, "0")}_${"Fixture".padEnd(22, "0")}_002`,
};

const paddlePrice = (id, amount, currency, cycle) => ({
  id,
  billing_cycle: cycle,
  unit_price: { amount: String(amount), currency_code: currency },
});
const monthly = { interval: "month", frequency: 1 };
const yearly = { interval: "year", frequency: 1 };

function paddleSubscriptions() {
  const now = Date.now();
  const [thisMonth] = monthStarts(1);
  return [
    {
      id: "sub_paddle_monthly",
      status: "active",
      customer_id: "ctm_1",
      currency_code: "USD",
      billing_cycle: monthly,
      current_billing_period: { starts_at: iso(thisMonth[0]), ends_at: iso(thisMonth[1]) },
      discount: null,
    },
    {
      id: "sub_paddle_yearly",
      status: "active",
      customer_id: "ctm_2",
      currency_code: "USD",
      billing_cycle: yearly,
      current_billing_period: { starts_at: iso(now - 150 * DAY), ends_at: iso(now + 215 * DAY) },
      discount: {
        id: "dsc_forever",
        starts_at: iso(now - 150 * DAY),
        ends_at: null,
        type: "recurring",
      },
    },
    {
      id: "sub_paddle_eur",
      status: "past_due",
      customer_id: "ctm_3",
      currency_code: "EUR",
      billing_cycle: monthly,
      current_billing_period: { starts_at: iso(now - 15 * DAY), ends_at: iso(now + 15 * DAY) },
      discount: null,
    },
    {
      id: "sub_paddle_imported",
      status: "active",
      customer_id: "ctm_4",
      currency_code: "USD",
      billing_cycle: monthly,
      current_billing_period: { starts_at: iso(thisMonth[0]), ends_at: iso(thisMonth[1]) },
      discount: null,
    },
  ];
}

function paddleTransaction(id, subscription, currency, price, period, totals, adjusted) {
  const strings = (entries) =>
    Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, String(v)]));
  const whole = { ...totals, grand_total: totals.total, grand_total_tax: totals.tax };
  return {
    id,
    status: "completed",
    subscription_id: subscription,
    origin: subscription ? "subscription_recurring" : "web",
    currency_code: currency,
    billed_at: iso(period[0]),
    billing_period: { starts_at: iso(period[0]), ends_at: iso(period[1]) },
    items: [{ price, quantity: 1, proration: null }],
    details: {
      line_items: [
        {
          price_id: price.id,
          quantity: 1,
          proration: null,
          totals: strings(totals),
        },
      ],
      totals: strings(whole),
      adjusted_totals: strings(adjusted ?? { total: totals.total, tax: totals.tax }),
    },
  };
}

function paddleTransactions() {
  const now = Date.now();
  const monthlyPrice = paddlePrice("pri_monthly", 3000, "USD", monthly);
  const transactions = monthStarts(14).map((period, k) =>
    paddleTransaction(`txn_monthly_${k}`, "sub_paddle_monthly", "USD", monthlyPrice, period, {
      subtotal: 3000,
      discount: 0,
      tax: 600,
      total: 3600,
    }),
  );
  transactions.push(
    paddleTransaction(
      "txn_yearly",
      "sub_paddle_yearly",
      "USD",
      paddlePrice("pri_yearly", 120000, "USD", yearly),
      [now - 150 * DAY, now + 215 * DAY],
      { subtotal: 120000, discount: 12000, tax: 21600, total: 129600 },
    ),
    paddleTransaction(
      "txn_eur",
      "sub_paddle_eur",
      "EUR",
      paddlePrice("pri_eur", 5000, "EUR", monthly),
      [now - 45 * DAY, now - 15 * DAY],
      { subtotal: 5000, discount: 1000, tax: 800, total: 4800 },
    ),
    // A one-off purchase outside any subscription.
    paddleTransaction(
      "txn_one_off",
      null,
      "USD",
      paddlePrice("pri_once", 9900, "USD", null),
      [now - 3 * DAY, now - 3 * DAY],
      { subtotal: 9900, discount: 0, tax: 0, total: 9900 },
    ),
    // A one-off purchase refunded in full, which its adjusted totals show.
    paddleTransaction(
      "txn_refunded",
      null,
      "USD",
      paddlePrice("pri_once", 5000, "USD", null),
      [now - 8 * DAY, now - 8 * DAY],
      { subtotal: 5000, discount: 0, tax: 1000, total: 6000 },
      { total: 0, tax: 0 },
    ),
  );
  return transactions;
}

/** The subscription filter of each transactions request, for the tests to inspect. */
const paddleSubscriptionFilters = [];

function paddle(url, request, send) {
  const [, , env, ...rest] = url.pathname.split("/");
  if (url.pathname === "/paddle/requests") return send(200, paddleSubscriptionFilters.splice(0));
  const path = `/${rest.join("/")}`;
  const error = (status, code, detail) =>
    send(status, { error: { type: "request_error", code, detail }, meta: { request_id: "fake" } });
  if (request.headers["paddle-version"] !== "1")
    return error(400, "invalid_field", "Requests must pin Paddle-Version 1.");
  const key = (request.headers.authorization ?? "").replace(/^Bearer /, "");
  // A sandbox key used on the live API is an invalid token, as Paddle answers it.
  if (env !== "test" || !Object.values(PADDLE_KEYS).includes(key))
    return error(403, "invalid_token", "Invalid or revoked API key.");
  const page = (data) =>
    send(200, {
      data,
      meta: {
        request_id: "fake",
        pagination: {
          per_page: data.length,
          next: `https://api.paddle.com${path}?after=last`,
          has_more: false,
          estimated_total: data.length,
        },
      },
    });
  if (path === "/subscriptions") {
    if (url.searchParams.get("status") !== "active,past_due")
      return error(400, "invalid_field", "Only active and past-due subscriptions are expected.");
    return page(paddleSubscriptions());
  }
  if (path === "/transactions") {
    if (key === PADDLE_KEYS.noperm)
      return error(403, "forbidden", "You aren't permitted to perform this request.");
    if (url.searchParams.get("status") !== "paid,completed")
      return error(400, "invalid_field", "Only paid transactions are expected.");
    const since = Date.parse(url.searchParams.get("billed_at[GTE]") ?? "");
    if (Number.isNaN(since)) return error(400, "invalid_time_query_parameter", "billed_at");
    const before = Date.parse(url.searchParams.get("billed_at[LT]") ?? "") || Infinity;
    const billed = (t) => Date.parse(t.billed_at);
    const subscriptions = url.searchParams.get("subscription_id")?.split(",");
    paddleSubscriptionFilters.push(subscriptions ?? null);
    const listed = paddleTransactions().filter(
      (t) =>
        billed(t) >= since &&
        billed(t) < before &&
        (!subscriptions || subscriptions.includes(t.subscription_id)),
    );
    if (url.searchParams.get("order_by") === "billed_at[DESC]")
      listed.sort((a, b) => billed(b) - billed(a));
    return page(listed);
  }
  return error(404, "not_found", `Unknown path ${path}`);
}

// Polar -----------------------------------------------------------------------------------------

export const POLAR_TOKENS = { one: `polar_oat_${"harborfixture0001".padEnd(43, "0")}` };

function polarSubscriptions() {
  const now = Date.now();
  const base = (id, status, amount, currency, interval, customer, extra = {}) => ({
    id,
    status,
    amount,
    currency,
    recurring_interval: interval,
    recurring_interval_count: 1,
    current_period_start: iso(now - 10 * DAY),
    customer_id: customer,
    discount: null,
    prices: [{ id: `price_${id}`, amount_type: "fixed" }],
    ...extra,
  });
  return [
    base("pol_monthly", "active", 2000, "usd", "month", "pc1", {
      prices: [
        { id: "price_pol_monthly", amount_type: "fixed" },
        { id: "price_metered", amount_type: "metered_unit" },
      ],
    }),
    base("pol_yearly", "active", 24000, "usd", "year", "pc2", {
      current_period_start: iso(now - 90 * DAY),
      discount: { type: "percentage", duration: "once", basis_points: 2500 },
    }),
    base("pol_eur", "past_due", 1200, "eur", "month", "pc3"),
    base("pol_trial", "trialing", 5000, "usd", "month", "pc4"),
  ];
}

function polarOrder(id, subscription, currency, reason, created, amounts, items, status = "paid") {
  return {
    id,
    status,
    billing_reason: reason,
    subscription_id: subscription,
    currency,
    ...amounts,
    created_at: iso(created),
    items,
    product: { recurring_interval: "month", recurring_interval_count: 1 },
  };
}

function polarOrders() {
  const now = Date.now();
  const orders = monthStarts(14).map(([start, end], k) =>
    polarOrder(
      `ord_monthly_${k}`,
      "pol_monthly",
      "usd",
      k === 13 ? "subscription_create" : "subscription_cycle",
      start,
      {
        subtotal_amount: 2500,
        discount_amount: 0,
        net_amount: 2500,
        tax_amount: 500,
        total_amount: 3000,
      },
      [
        {
          amount: 2000,
          tax_amount: 400,
          proration: false,
          product_price_id: "price_pol_monthly",
          start_timestamp: iso(start),
          end_timestamp: iso(end),
        },
        // Metered usage from the previous period, billed in arrears.
        {
          amount: 500,
          tax_amount: 100,
          proration: false,
          product_price_id: "price_metered",
          start_timestamp: iso(start),
          end_timestamp: iso(end),
        },
      ],
    ),
  );
  const yearlyStart = now - 90 * DAY;
  orders.push(
    {
      ...polarOrder(
        "ord_yearly",
        "pol_yearly",
        "usd",
        "subscription_create",
        yearlyStart,
        {
          subtotal_amount: 32000,
          discount_amount: 8000,
          net_amount: 24000,
          tax_amount: 0,
          total_amount: 24000,
        },
        [
          {
            amount: 32000,
            tax_amount: 0,
            proration: false,
            product_price_id: "price_pol_yearly",
            start_timestamp: iso(yearlyStart),
            end_timestamp: iso(yearlyStart + 365 * DAY),
          },
        ],
      ),
      product: { recurring_interval: "year", recurring_interval_count: 1 },
    },
    polarOrder(
      "ord_eur",
      "pol_eur",
      "eur",
      "subscription_cycle",
      now - 20 * DAY,
      {
        subtotal_amount: 1200,
        discount_amount: 0,
        net_amount: 1000,
        tax_amount: 200,
        total_amount: 1200,
      },
      [
        {
          amount: 1200,
          tax_amount: 200,
          proration: false,
          product_price_id: "price_pol_eur",
          start_timestamp: iso(now - 20 * DAY),
          end_timestamp: iso(now + 10 * DAY),
        },
      ],
    ),
    // One-time purchases: one paid, one refunded in full.
    {
      ...polarOrder(
        "ord_once",
        null,
        "usd",
        "purchase",
        now - 10 * DAY,
        {
          subtotal_amount: 1500,
          discount_amount: 0,
          net_amount: 1500,
          tax_amount: 300,
          total_amount: 1800,
        },
        [],
      ),
      product: { recurring_interval: null, recurring_interval_count: null },
    },
    {
      ...polarOrder(
        "ord_refunded",
        null,
        "usd",
        "purchase",
        now - 8 * DAY,
        {
          subtotal_amount: 800,
          discount_amount: 0,
          net_amount: 800,
          tax_amount: 0,
          total_amount: 800,
          refunded_amount: 800,
        },
        [],
        "refunded",
      ),
      product: { recurring_interval: null, recurring_interval_count: null },
    },
  );
  return orders;
}

function polar(url, request, send) {
  const [, , env, ...rest] = url.pathname.split("/");
  const path = `/${rest.join("/")}`;
  if (request.headers["polar-version"] !== "2026-10") return send(404, { detail: "Not Found" });
  const key = (request.headers.authorization ?? "").replace(/^Bearer /, "");
  // Fixture tokens are sandbox tokens: production does not know them.
  if (env !== "test" || !Object.values(POLAR_TOKENS).includes(key))
    return send(401, {
      error: "invalid_token",
      error_description:
        "The access token provided is expired, revoked, malformed, or invalid for other reasons.",
    });
  const page = (items) =>
    send(200, { items, pagination: { total_count: items.length, max_page: items.length ? 1 : 0 } });
  const statuses = url.searchParams.getAll("status");
  if (path === "/v1/organizations/") return page([{ id: "org_fixture", name: "Fixture" }]);
  if (path === "/v1/subscriptions/")
    return page(polarSubscriptions().filter((s) => statuses.includes(s.status)));
  if (path === "/v1/orders/") {
    const type = url.searchParams.get("product_billing_type");
    if (type !== null && type !== "recurring")
      return send(422, { error: "RequestValidationError", detail: [] });
    const after = Date.parse(url.searchParams.get("created_after") ?? "");
    const before = Date.parse(url.searchParams.get("created_before") ?? "") || Infinity;
    const created = (o) => Date.parse(o.created_at);
    const orders = polarOrders().filter(
      (o) =>
        statuses.includes(o.status) &&
        created(o) > after &&
        created(o) < before &&
        (type === null || o.product?.recurring_interval),
    );
    if (url.searchParams.get("sorting") === "-created_at")
      orders.sort((a, b) => created(b) - created(a));
    return page(orders);
  }
  return send(404, { error: "ResourceNotFound", detail: `Unknown path ${path}` });
}

// Dodo Payments ---------------------------------------------------------------------------------

export const DODO_KEYS = { one: "dodo_test_harborfixture0001" };

function dodoSubscriptions() {
  const now = Date.now();
  const base = (id, status, amount, currency, interval, customer, extra = {}) => ({
    subscription_id: id,
    status,
    customer: { customer_id: customer, name: "Fixture customer", email: "customer@example.test" },
    recurring_pre_tax_amount: amount,
    currency,
    tax_inclusive: false,
    payment_frequency_interval: interval,
    payment_frequency_count: 1,
    trial_period_days: 0,
    created_at: iso(now - 60 * DAY),
    on_demand: false,
    quantity: 1,
    ...extra,
  });
  return [
    base("sub_dodo_monthly", "active", 1500, "USD", "Month", "dc1"),
    base("sub_dodo_yearly", "active", 12000, "USD", "Year", "dc2"),
    base("sub_dodo_on_demand", "active", 9900, "USD", "Month", "dc4", { on_demand: true }),
    base("sub_dodo_trial", "active", 4000, "USD", "Month", "dc5", {
      created_at: iso(now - 2 * DAY),
      trial_period_days: 14,
    }),
    base("sub_dodo_eur", "past_due", 2400, "EUR", "Month", "dc3", { tax_inclusive: true }),
    base("sub_dodo_on_hold", "on_hold", 7000, "USD", "Month", "dc6"),
  ];
}

// Successful payments, as the list gives them: without tax, refunds or disputes.
function dodoPayments() {
  const now = Date.now();
  const payment = (id, created, total, currency, extra = {}) => ({
    payment_id: id,
    total_amount: total,
    currency,
    created_at: iso(created),
    status: "succeeded",
    refund_status: null,
    dispute_status: null,
    subscription_id: null,
    ...extra,
  });
  return [
    ...monthStarts(6).map(([start], k) =>
      payment(`pay_monthly_${k}`, start, 1500, "USD", { subscription_id: "sub_dodo_monthly" }),
    ),
    payment("pay_yearly", now - 60 * DAY, 12000, "USD", { subscription_id: "sub_dodo_yearly" }),
    payment("pay_eur", now - 20 * DAY, 2400, "EUR", { subscription_id: "sub_dodo_eur" }),
    payment("pay_once", now - 4 * DAY, 3000, "USD"),
    payment("pay_refunded", now - 9 * DAY, 1000, "USD", { refund_status: "full" }),
    payment("pay_disputed", now - 11 * DAY, 2000, "USD", { dispute_status: "dispute_lost" }),
  ];
}

// A payment read alone, with its tax, refunds and disputes.
function dodoPayment(id) {
  const payment = dodoPayments().find((p) => p.payment_id === id);
  if (!payment) return null;
  const tax = { pay_eur: 400, pay_once: 500 }[id] ?? 0;
  const refunds =
    id === "pay_refunded"
      ? [{ refund_id: "ref_1", amount: 1000, status: "succeeded", currency: "USD" }]
      : [];
  const disputes =
    id === "pay_disputed" ? [{ dispute_id: "dsp_1", dispute_status: "dispute_lost" }] : [];
  return { ...payment, tax, refunds, disputes };
}

function dodo(url, request, send) {
  const [, , env, ...rest] = url.pathname.split("/");
  const path = `/${rest.join("/")}`;
  const key = (request.headers.authorization ?? "").replace(/^Bearer /, "");
  // Fixture keys are test keys: the live API does not know them.
  if (env !== "test" || !Object.values(DODO_KEYS).includes(key))
    return send(401, { error: "Unauthorized" });
  if (path === "/brands") return send(200, { items: [{ brand_id: "brnd_fixture" }] });
  if (path === "/subscriptions") {
    if (url.searchParams.get("page_number") === null)
      return send(422, { code: "INVALID_QUERY_PARAMS", message: "page_number is expected." });
    const status = url.searchParams.get("status");
    const pageNumber = Number(url.searchParams.get("page_number"));
    return send(200, {
      items: pageNumber === 0 ? dodoSubscriptions().filter((s) => s.status === status) : [],
    });
  }
  if (path === "/payments") {
    if (url.searchParams.get("status") !== "succeeded") return send(200, { items: [] });
    if (url.searchParams.has("subscription_id"))
      return send(200, {
        items:
          url.searchParams.get("subscription_id") === "sub_dodo_eur"
            ? [{ payment_id: "pay_eur", total_amount: 2400, currency: "EUR" }]
            : [],
      });
    // A page shorter than asked for is the last one.
    const since = Date.parse(url.searchParams.get("created_at_gte") ?? "") || 0;
    const until = Date.parse(url.searchParams.get("created_at_lte") ?? "") || Infinity;
    const size = Math.min(Number(url.searchParams.get("page_size") ?? 10), 100);
    const pageNumber = Number(url.searchParams.get("page_number") ?? 0);
    const listed = dodoPayments().filter((p) => {
      const created = Date.parse(p.created_at);
      return created >= since && created <= until;
    });
    return send(200, { items: listed.slice(pageNumber * size, (pageNumber + 1) * size) });
  }
  const paymentId = path.match(/^\/payments\/([^/]+)$/)?.[1];
  const found = paymentId && dodoPayment(paymentId);
  if (found) return send(200, found);
  return send(404, { code: "NOT_FOUND", message: `Unknown path ${path}` });
}

/** Answers a request for one of the providers, or returns false for anything else. */
export function handleBilling(url, request, response) {
  const send = (status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
    return true;
  };
  if (url.pathname.startsWith("/paddle/")) return paddle(url, request, send);
  if (url.pathname.startsWith("/polar/")) return polar(url, request, send);
  if (url.pathname.startsWith("/dodo/")) return dodo(url, request, send);
  return false;
}
