// Stand-ins for the Creem, Chargebee, Whop and RevenueCat APIs, for the tests only. Creem and Whop
// live under their prefix with /live or /test for the environment, Chargebee under its prefix and
// the site, and RevenueCat under its prefix, as the app's overrides expect. Figures are placed
// relative to the current time, and EUR is 0.8 per USD.
//
// Creem test key "one": $25 a month, and a past-due EUR 120 yearly plan with 20% VAT included
// (EUR 100 net, $10.42 a month) whose product the subscription names by id only; a trial is not
// counted: MRR $35.42 from 2 customers. Transactions give $25 at every month-end, $35.42 now and
// $25 thirty days ago.
//
// Chargebee test site "harbor-test": $40 a month less a $10 coupon it keeps ($30; the latest
// invoice also used a promotional credit, which is not a discount), and a EUR 60 yearly plan with
// EUR 10 of tax included ($5.21 a month) set to cancel at term end. A new subscription without a
// paid invoice is skipped: MRR $35.21 from 2 customers. Invoices give $30 at every month-end,
// $35.21 now and $30 thirty days ago.
//
// Whop sandbox key "one": $15 every 30 days with tax on top, a EUR 96 yearly plan with 20% VAT
// included in its first period at 20% off for good (EUR 64 net, $6.67 a month), and a past-due $15
// membership; a paused one is not counted: MRR $36.67 from 3 customers. Payments give $15 at every
// month-end, $21.67 now and $30 thirty days ago. Key "writer" can also change plans and is refused.
//
// RevenueCat key "one" on project "projharbor1": the MRR chart without tax shows $100 until this
// month and $150 since, with 42 active subscriptions: MRR $150 from 42 subscriptions, $100 at
// every month-end and thirty days ago. Key "wide" can also read customers and is refused.
//
// For revenue, every paid transaction, invoice or payment counts after refunds and without tax.
// Creem adds a one-time payment of EUR 24.20 with EUR 4.20 of VAT, half refunded (EUR 10), and one
// charged back ($0). Chargebee adds a one-time $20 invoice and one refunded in full through a
// credit note ($0). Whop adds a one-time $40 payment and one refunded in full ($0). RevenueCat's
// revenue chart without tax shows $5 a day for the last 400 days.

const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();
const seconds = (ms) => Math.floor(ms / 1000);

function monthStarts(count) {
  const now = new Date();
  return Array.from({ length: count }, (_, k) => [
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1),
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k + 1, 1),
  ]);
}

/** Within this month and less than 30 days ago, so no completed month-end or 30 days ago sees it. */
function recentStart() {
  const [[thisMonth]] = monthStarts(1);
  return Math.max(Date.now() - 20 * DAY, thisMonth);
}

// Creem -----------------------------------------------------------------------------------------

export const CREEM_KEYS = { one: "creem_test_harborfixture0001" };

const creemMonthly = {
  id: "prod_creem_monthly",
  price: 2500,
  currency: "USD",
  billing_type: "recurring",
  billing_period: "every-month",
  recurring_interval: "month",
  recurring_interval_count: 1,
  tax_mode: "exclusive",
  usage_prices: [],
};
const creemYearly = {
  ...creemMonthly,
  id: "prod_creem_yearly",
  price: 12000,
  currency: "EUR",
  billing_period: "every-year",
  recurring_interval: "year",
  tax_mode: "inclusive",
};

// Timestamps in milliseconds, as Creem's examples show them.
function creemTransactions() {
  const now = Date.now();
  const transaction = (id, subscription, currency, start, end, paid, tax, extra = {}) => ({
    id,
    object: "transaction",
    amount: paid,
    amount_paid: paid,
    discount_amount: 0,
    tax_amount: tax,
    currency,
    type: "invoice",
    status: "paid",
    subscription,
    customer: "cust_1",
    period_start: start,
    period_end: end,
    created_at: start,
    ...extra,
  });
  const monthly = monthStarts(14).map(([start, end], k) =>
    transaction(`tran_monthly_${k}`, "sub_creem_monthly", "USD", start, end, 2500, 0),
  );
  const start = recentStart();
  const end = new Date(start);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  return [
    ...monthly,
    transaction("tran_once", null, "USD", start, start, 5000, 0, { type: "payment" }),
    transaction("tran_yearly", "sub_creem_yearly", "EUR", start, end.getTime(), 12000, 2000, {
      customer: "cust_2",
    }),
    transaction("tran_refund", null, "EUR", now - 6 * DAY, now - 6 * DAY, 2420, 420, {
      type: "payment",
      status: "partialRefund",
      refunded_amount: 1210,
    }),
    transaction("tran_chargeback", null, "USD", now - 7 * DAY, now - 7 * DAY, 3000, 0, {
      type: "payment",
      status: "chargedBack",
      refunded_amount: 3000,
    }),
  ];
}

function creemSubscriptions() {
  const [latest] = creemTransactions();
  return [
    {
      id: "sub_creem_monthly",
      status: "active",
      product: creemMonthly,
      customer: { id: "cust_1" },
      items: [{ product_id: "prod_creem_monthly", units: 1 }],
      discount: null,
      last_transaction: latest,
    },
    // The list names this product by id and gives no last transaction.
    {
      id: "sub_creem_yearly",
      status: "past_due",
      product: "prod_creem_yearly",
      customer: "cust_2",
    },
    { id: "sub_creem_trial", status: "trialing", product: creemMonthly, customer: "cust_3" },
  ];
}

function creem(url, request, send) {
  const [, , env, ...rest] = url.pathname.split("/");
  const path = `/${rest.join("/")}`;
  const key = request.headers["x-api-key"];
  // Fixture keys are test keys: the live API does not know them.
  if (env !== "test" || !Object.values(CREEM_KEYS).includes(key))
    return send(403, { trace_id: "trace_fixture", status: 403, error: "Forbidden" });
  // Pages of at most ten, so the client follows next_page.
  const page = (items) => {
    const number = Number(url.searchParams.get("page_number") ?? 1);
    const size = Math.min(Number(url.searchParams.get("page_size") ?? 10), 10);
    const pages = Math.max(1, Math.ceil(items.length / size));
    return send(200, {
      items: items.slice((number - 1) * size, number * size),
      pagination: {
        total_records: items.length,
        total_pages: pages,
        current_page: number,
        next_page: number < pages ? number + 1 : null,
        prev_page: number > 1 ? number - 1 : null,
      },
    });
  };
  if (path === "/v1/subscriptions/search") return page(creemSubscriptions());
  if (path === "/v1/transactions/search") return page(creemTransactions());
  if (path === "/v1/subscriptions") {
    const id = url.searchParams.get("subscription_id");
    const subscription = creemSubscriptions().find((s) => s.id === id);
    if (!subscription) return send(404, { status: 404, error: "Not Found" });
    const last = creemTransactions().find((t) => t.subscription === id && t.id !== "tran_once");
    return send(200, { ...subscription, last_transaction: subscription.last_transaction ?? last });
  }
  if (path === "/v1/products/prod_creem_yearly") return send(200, creemYearly);
  return send(404, { status: 404, error: "Not Found", message: [`Unknown path ${path}`] });
}

// Chargebee -------------------------------------------------------------------------------------

export const CHARGEBEE = { site: "harbor-test", key: "test_harborfixture0001chargebee" };

function chargebeeSubscriptions() {
  const [[thisMonth]] = monthStarts(1);
  const yearlyStart = recentStart();
  const subscription = (id, status, customer, currency, unit, termStart, coupons = []) => ({
    id,
    status,
    customer_id: customer,
    currency_code: currency,
    billing_period: 1,
    billing_period_unit: unit,
    current_term_start: seconds(termStart),
    coupons: coupons.map((coupon_id) => ({ coupon_id, applied_count: 3 })),
    discounts: [],
    mrr: 0,
  });
  return [
    subscription("cb_monthly", "active", "cb_cus_1", "USD", "month", thisMonth, ["LOYAL"]),
    subscription("cb_new", "active", "cb_cus_3", "USD", "month", Date.now() - 3 * DAY),
    subscription("cb_yearly", "non_renewing", "cb_cus_2", "EUR", "year", yearlyStart),
  ];
}

function chargebeeInvoices() {
  const line = (id, subscription, from, to, amount, extra = {}) => ({
    id,
    subscription_id: subscription,
    date_from: seconds(from),
    date_to: seconds(to),
    amount,
    discount_amount: 0,
    tax_amount: 0,
    entity_type: "plan_item_price",
    metered: false,
    ...extra,
  });
  const invoices = monthStarts(14).map(([start, end], k) => {
    const discounts = [
      {
        line_item_id: `li_${k}`,
        discount_type: "item_level_coupon",
        entity_id: "LOYAL",
        discount_amount: 1000,
      },
    ];
    if (k === 13)
      discounts.push({
        line_item_id: `li_${k}`,
        discount_type: "document_level_coupon",
        entity_id: "WELCOME",
        discount_amount: 500,
      });
    if (k === 0)
      discounts.push({
        line_item_id: `li_${k}`,
        discount_type: "promotional_credits",
        entity_id: null,
        discount_amount: 300,
      });
    const lines = [line(`li_${k}`, "cb_monthly", start, end, 4000)];
    if (k === 13)
      lines.push(
        line("li_setup", "cb_monthly", start, start, 3000, { entity_type: "charge_item_price" }),
      );
    const lineTotal = lines.reduce((sum, item) => sum + item.amount, 0);
    const total = lineTotal - discounts.reduce((sum, item) => sum + item.discount_amount, 0);
    return {
      id: `cb_inv_${k}`,
      status: "paid",
      recurring: true,
      price_type: "tax_exclusive",
      currency_code: "USD",
      date: seconds(start),
      total,
      tax: 0,
      amount_paid: total,
      line_items: lines,
      line_item_discounts: discounts,
    };
  });
  const start = recentStart();
  const end = new Date(start);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  invoices.push({
    id: "cb_inv_yearly",
    status: "paid",
    recurring: true,
    price_type: "tax_inclusive",
    currency_code: "EUR",
    date: seconds(start),
    total: 6000,
    tax: 1000,
    amount_paid: 6000,
    line_items: [line("li_yearly", "cb_yearly", start, end.getTime(), 6000, { tax_amount: 1000 })],
    line_item_discounts: [],
  });
  const oneTime = (id, date, total, tax) => ({
    id,
    status: "paid",
    recurring: false,
    price_type: "tax_exclusive",
    currency_code: "USD",
    date: seconds(date),
    total,
    tax,
    amount_paid: total,
    line_items: [
      line(`li_${id}`, null, date, date, total - tax, {
        entity_type: "charge_item_price",
        tax_amount: tax,
      }),
    ],
    line_item_discounts: [],
  });
  invoices.push(
    oneTime("cb_inv_once", Date.now() - 7 * DAY, 2000, 0),
    oneTime("cb_inv_refunded", Date.now() - 9 * DAY, 1200, 200),
  );
  return invoices;
}

function chargebeeCreditNotes() {
  return [
    {
      id: "cb_cn_1",
      type: "refundable",
      reference_invoice_id: "cb_inv_refunded",
      date: seconds(Date.now() - 8 * DAY),
      total: 1200,
      amount_refunded: 1200,
      taxes: [{ name: "VAT", amount: 200 }],
    },
  ];
}

function chargebee(url, request, send) {
  const [, , site, ...rest] = url.pathname.split("/");
  const path = `/${rest.join("/")}`;
  if (site !== CHARGEBEE.site)
    return send(404, {
      api_error_code: "site_not_found",
      message: "Sorry, we couldn't find that site.",
    });
  const expected = `Basic ${Buffer.from(`${CHARGEBEE.key}:`).toString("base64")}`;
  if (request.headers.authorization !== expected)
    return send(401, {
      api_error_code: "api_authentication_failed",
      message: "Sorry, authentication failed. Invalid api key",
    });
  // Pages of four, so the client follows next_offset.
  const page = (entries) => {
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const next = offset + 4 < entries.length ? String(offset + 4) : undefined;
    return send(200, { list: entries.slice(offset, offset + 4), next_offset: next });
  };
  if (path === "/subscriptions") {
    const status = url.searchParams.get("status[is]");
    return page(
      chargebeeSubscriptions()
        .filter((s) => s.status === status)
        .map((subscription) => ({
          subscription,
          customer: { id: subscription.customer_id, email: "customer@example.test" },
        })),
    );
  }
  if (path === "/invoices") {
    const paid = url.searchParams.get("amount_paid[gt]") === "0";
    if (!paid && url.searchParams.get("status[is]") !== "paid")
      return send(400, { api_error_code: "invalid_request", message: "Only paid invoices." });
    const recurring = url.searchParams.get("recurring[is]");
    const after = Number(url.searchParams.get("date[after]"));
    const before = Number(url.searchParams.get("date[before]") ?? Infinity);
    const invoices = chargebeeInvoices().filter(
      (invoice) =>
        invoice.date > after &&
        invoice.date < before &&
        (recurring === null || String(invoice.recurring) === recurring),
    );
    if (url.searchParams.get("sort_by[desc]") === "date") invoices.sort((a, b) => b.date - a.date);
    return page(invoices.map((invoice) => ({ invoice })));
  }
  if (path === "/credit_notes") {
    if (url.searchParams.get("type[is]") !== "refundable")
      return send(400, { api_error_code: "invalid_request", message: "Only refunds." });
    const after = Number(url.searchParams.get("date[after]"));
    return page(
      chargebeeCreditNotes()
        .filter((note) => note.date > after)
        .map((credit_note) => ({ credit_note })),
    );
  }
  return send(404, { api_error_code: "resource_not_found", message: `Unknown path ${path}` });
}

// Whop ------------------------------------------------------------------------------------------

export const WHOP_KEYS = {
  one: "whop_harborfixture_one_000000",
  writer: "whop_harborfixture_writer_00",
};
const READS = [
  "member:basic:read",
  "plan:basic:read",
  "payment:basic:read",
  "promo_code:basic:read",
];

const whopPlans = {
  plan_w_monthly: {
    id: "plan_w_monthly",
    plan_type: "renewal",
    renewal_price: 15,
    initial_price: 15,
    billing_period: 30,
    currency: "usd",
    tax_type: "exclusive",
  },
  plan_w_yearly: {
    id: "plan_w_yearly",
    plan_type: "renewal",
    renewal_price: 96,
    initial_price: 96,
    billing_period: 365,
    currency: "eur",
    tax_type: "inclusive",
  },
};

function whopMemberships() {
  const now = Date.now();
  const membership = (id, status, plan, user, periodStart) => ({
    id,
    status,
    plan_id: plan,
    product_id: "prod_w",
    user_id: user,
    cancel_at_period_end: false,
    current_period_start: iso(periodStart),
    account: { id: "biz_harbor", title: "Harbor Fixture" },
  });
  return {
    active: [
      membership("wm_1", "active", "plan_w_monthly", "user_w1", now - 3_600_000),
      membership("wm_2", "active", "plan_w_yearly", "user_w2", recentStart()),
      membership("wm_4", "active", "plan_w_monthly", "user_w4", now - 5 * DAY),
    ],
    past_due: [membership("wm_3", "past_due", "plan_w_monthly", "user_w3", now - 5 * DAY)],
    paused: [membership("wm_4", "active", "plan_w_monthly", "user_w4", now - 5 * DAY)],
  };
}

function whopPayments() {
  const now = Date.now();
  const money = (amount, currency = "usd") => ({
    amount,
    currency,
    decimals: 2,
    display_decimals: 2,
  });
  const payment = (id, membership, plan, reason, paid, total, tax, extra = {}) => ({
    id,
    status: "paid",
    substatus: "succeeded",
    billing_reason: reason,
    membership_id: membership,
    plan_id: plan,
    promo_code_id: null,
    paid_at: iso(paid),
    created_at: iso(paid),
    total,
    tax_amount: tax,
    tax_behavior: tax ? "exclusive" : "unspecified",
    ...extra,
  });
  // wm_1 pays every 30 days, and has since 14 periods ago.
  const monthly = Array.from({ length: 15 }, (_, k) =>
    payment(
      `pay_w1_${k}`,
      "wm_1",
      "plan_w_monthly",
      k === 14 ? "subscription_create" : "subscription_cycle",
      now - k * 30 * DAY - 3_600_000,
      money("16.50"),
      money("1.50"),
    ),
  );
  return [
    ...monthly,
    payment(
      "pay_w2",
      "wm_2",
      "plan_w_yearly",
      "subscription_create",
      recentStart(),
      money("76.80", "eur"),
      money("12.80", "eur"),
      {
        promo_code_id: "promo_w20",
        tax_behavior: "inclusive",
      },
    ),
    payment(
      "pay_w3",
      "wm_3",
      "plan_w_monthly",
      "subscription_cycle",
      now - 35 * DAY,
      money("15.00"),
      null,
    ),
    payment("pay_w_once", null, null, "one_time", now - 7 * DAY, money("40.00"), null),
    payment("pay_w_refund", null, null, "one_time", now - 9 * DAY, money("20.00"), null, {
      substatus: "refunded",
      refunded_amount: money("20.00"),
      tax_refunded_amount: money("0.00"),
    }),
  ];
}

function whop(url, request, send) {
  const [, , env, ...rest] = url.pathname.split("/");
  const path = `/${rest.join("/")}`;
  if (request.headers["api-version-date"] !== "2026-09-25")
    return send(400, { error: { type: "invalid_request", message: "Pin the API version." } });
  const key = (request.headers.authorization ?? "").replace(/^Bearer /, "");
  // Fixture keys are sandbox keys: production does not know them.
  if (env !== "test" || !Object.values(WHOP_KEYS).includes(key))
    return send(401, { error: { type: "unauthorized", message: "Invalid API key." } });
  const account = url.searchParams.get("account_id");
  // Pages of two, so the client follows the cursor.
  const page = (items) => {
    const offset = Number(url.searchParams.get("after") ?? 0);
    const next = offset + 2 < items.length;
    return send(200, {
      data: items.slice(offset, offset + 2),
      page_info: { end_cursor: next ? String(offset + 2) : null, has_next_page: next },
    });
  };
  if (path === "/accounts")
    return send(200, {
      data: [{ id: "biz_harbor", title: "Harbor Fixture" }],
      page_info: { end_cursor: null, has_next_page: false },
    });
  if (path === "/permissions") {
    const granted = key === WHOP_KEYS.writer ? [...READS, "plan:update"] : READS;
    const actions = [...READS, "plan:update", "payment:charge", "member:email:read"];
    return send(200, {
      data: actions.map((action) => ({
        action,
        granted: url.searchParams.get("resource_id") === "biz_harbor" && granted.includes(action),
      })),
    });
  }
  if (account !== "biz_harbor" && ["/memberships", "/payments"].includes(path))
    return send(403, { error: { type: "forbidden", message: "Missing account_id." } });
  if (path === "/memberships") return page(whopMemberships()[url.searchParams.get("status")] ?? []);
  if (path === "/payments") {
    const after = Date.parse(url.searchParams.get("created_after") ?? "");
    const before = Date.parse(url.searchParams.get("created_before") ?? "") || Infinity;
    const created = (p) => Date.parse(p.created_at);
    const payments = whopPayments().filter(
      (p) =>
        p.status === url.searchParams.get("status") && created(p) > after && created(p) < before,
    );
    if (url.searchParams.get("direction") === "desc")
      payments.sort((a, b) => created(b) - created(a));
    return page(payments);
  }
  const plan = path.match(/^\/plans\/(.+)$/)?.[1];
  if (plan && whopPlans[plan]) return send(200, whopPlans[plan]);
  if (path === "/promo_codes/promo_w20")
    return send(200, {
      id: "promo_w20",
      promo_type: "percentage",
      amount_off: 0.2,
      duration: "forever",
      promo_duration_months: null,
    });
  return send(404, { error: { type: "not_found", message: `Unknown path ${path}` } });
}

// RevenueCat ------------------------------------------------------------------------------------

export const REVENUECAT = {
  project: "projharbor1",
  keys: { one: "sk_harborfixture0001", wide: "sk_harborwide000001" },
};
const RESOLUTIONS = [
  { id: "0", display_name: "day" },
  { id: "1", display_name: "week" },
  { id: "2", display_name: "month" },
];

function revenueCatChart(chart, start, end) {
  const [[thisMonth]] = monthStarts(1);
  const change = Math.floor(Math.max(Date.now() - 20 * DAY, thisMonth) / DAY) * DAY;
  const values = [];
  const first = Date.now() - 400 * DAY;
  const value = (day) => {
    if (chart === "mrr") return day >= change ? 150 : 100;
    if (chart === "revenue") return day >= first ? 5 : 0;
    return 42;
  };
  for (let day = Date.parse(start); day <= Date.parse(end); day += DAY)
    values.push(chart === "revenue" ? [seconds(day), value(day), 1] : [seconds(day), value(day)]);
  const names = { mrr: "MRR", revenue: "Revenue", actives: "Active Subscriptions" };
  return {
    object: "chart_data",
    category: chart === "actives" ? "subscription" : "revenue",
    display_name: names[chart],
    resolution: "day",
    yaxis_currency: "USD",
    measures:
      chart === "revenue"
        ? [
            { display_name: "Revenue", unit: "$" },
            { display_name: "Transactions", unit: "#" },
          ]
        : [{ display_name: chart === "mrr" ? "MRR" : "Actives", unit: "$" }],
    values,
  };
}

function revenueCat(url, request, send) {
  const path = url.pathname.slice("/revenuecat".length);
  const key = (request.headers.authorization ?? "").replace(/^Bearer /, "");
  if (!Object.values(REVENUECAT.keys).includes(key))
    return send(401, {
      object: "error",
      type: "authentication_error",
      message: "Invalid API key.",
    });
  const denied = () =>
    send(403, { object: "error", type: "authorization_error", message: "Permission denied." });
  const project = `/projects/${REVENUECAT.project}`;
  if (path === "/projects" || path === `${project}/customers`)
    return key === REVENUECAT.keys.wide ? send(200, { object: "list", items: [] }) : denied();
  if (!path.startsWith(`${project}/charts/`)) return denied();
  const [chart, options] = path.slice(`${project}/charts/`.length).split("/");
  if (!["mrr", "actives", "revenue"].includes(chart))
    return send(404, { object: "error", type: "resource_missing", message: "Unknown chart." });
  if (options === "options")
    return send(200, {
      object: "chart_options",
      resolutions: RESOLUTIONS,
      segments: [],
      filters: [],
      user_selectors:
        chart !== "actives"
          ? {
              revenue_type: {
                default: "revenue",
                display_name: "Revenue type",
                options: ["revenue", "revenue_net_of_taxes", "proceeds"].map((id) => ({
                  id,
                  display_name: id,
                })),
              },
            }
          : {},
    });
  const selectors = JSON.parse(url.searchParams.get("selectors") ?? "{}");
  if (url.searchParams.get("resolution") !== "0" || url.searchParams.get("currency") !== "USD")
    return send(400, { object: "error", type: "parameter_error", message: "Ask for USD by day." });
  if (chart !== "actives" && selectors.revenue_type !== "revenue_net_of_taxes")
    return send(400, {
      object: "error",
      type: "parameter_error",
      message: "Ask for MRR without tax.",
    });
  return send(
    200,
    revenueCatChart(chart, url.searchParams.get("start_date"), url.searchParams.get("end_date")),
  );
}

export function handleExtraBilling(url, request, response) {
  const send = (status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
    return true;
  };
  if (url.pathname.startsWith("/creem/")) return creem(url, request, send);
  if (url.pathname.startsWith("/chargebee/")) return chargebee(url, request, send);
  if (url.pathname.startsWith("/whop/")) return whop(url, request, send);
  if (url.pathname.startsWith("/revenuecat/")) return revenueCat(url, request, send);
  return false;
}
