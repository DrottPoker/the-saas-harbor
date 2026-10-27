// A stand-in for Paystack's API, for the tests only, under /paystack with /live or /test for the
// mode, as the key's override expects. All keys are test keys, so the live address refuses them.
// Figures are placed relative to the current time, in USD, whose amounts Paystack gives in cents.
//
// Key "one" has plans:read, transactions:read and disputes_refunds:read. Its subscriptions: $20 a
// month, charged on the 1st for 14 months (active); $120 a year, paid four months ago and
// cancelled since (non-renewing, $10 a month); $30 a quarter, paid eight and five months ago, whose
// renewal two months ago failed (attention, $10 a month); $15 a month, paid four and three months
// ago and cancelled; one that starts in a week, a free period; and one completed. MRR is $40 from
// 3 subscribers. The charges give $20 at the month-end a year back, and $30 now and thirty days
// ago.
//
// For revenue, besides the subscriptions' charges: a $50 payment with $0.75 of fees passed on to
// the customer ($50), a $30 one with $10 refunded ($20), one of $25 refunded in full ($0), a $40
// one whose refund failed ($40), and an abandoned one, which does not count. Key "plans" reads the
// same account but cannot list subscriptions, so MRR comes from the plan list, with the same
// figures. Key "secret" is a secret key, which this fake answers on every endpoint, and must be
// refused before any request is sent.

export const PAYSTACK = {
  one: "rk_test_harborpaystackone00000000001",
  plans: "rk_test_harborpaystackplans000000001",
  secret: "sk_test_harborpaystacksecret00000001",
};

const READ = ["plans:read", "transactions:read", "disputes_refunds:read"];
const keys = {
  [PAYSTACK.one]: { scopes: READ, subscriptions: true },
  [PAYSTACK.plans]: { scopes: READ, subscriptions: false },
  [PAYSTACK.secret]: { scopes: null, subscriptions: true },
};

const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();

const plan = (id, code, name, amount, interval) => ({
  id,
  domain: "test",
  name,
  plan_code: code,
  description: null,
  amount,
  interval,
  send_invoices: true,
  send_sms: false,
  currency: "USD",
  integration: 100001,
  createdAt: iso(Date.UTC(2024, 0, 1)),
  updatedAt: iso(Date.UTC(2024, 0, 1)),
});

const PLANS = {
  monthly: plan(101, "PLN_harbormonthly", "Monthly", 2000, "monthly"),
  annual: plan(102, "PLN_harborannual", "Annual", 12000, "annually"),
  quarterly: plan(103, "PLN_harborquarterly", "Quarterly", 3000, "quarterly"),
  basic: plan(104, "PLN_harborbasic", "Basic", 1500, "monthly"),
  pro: plan(105, "PLN_harborpro", "Pro", 5000, "monthly"),
};

const customer = (id) => ({
  id,
  first_name: null,
  last_name: null,
  email: `customer${id}@example.test`,
  customer_code: `CUS_harbor${id}`,
  phone: null,
  metadata: null,
  risk_action: "default",
});

function subscriptions() {
  const now = Date.now();
  const subscription = (code, status, planKey, customerId, startMs) => ({
    id: Number(customerId) * 10,
    domain: "test",
    status,
    start: Math.floor(startMs / 1000),
    quantity: 1,
    subscription_code: code,
    email_token: `token${customerId}`,
    amount: PLANS[planKey].amount,
    cron_expression: "0 0 1 * *",
    next_payment_date: iso(now + 20 * DAY),
    open_invoice: null,
    createdAt: iso(Math.min(startMs, now)),
    integration: 100001,
    plan: PLANS[planKey],
    customer: customer(customerId),
    invoice_limit: 0,
    split_code: null,
    most_recent_invoice: null,
  });
  return [
    subscription("SUB_harbormonthly", "active", "monthly", 1, now - 400 * DAY),
    subscription("SUB_harborannual", "non-renewing", "annual", 2, now - 125 * DAY),
    subscription("SUB_harborquarterly", "attention", "quarterly", 3, now - 250 * DAY),
    subscription("SUB_harborcancelled", "cancelled", "basic", 4, now - 125 * DAY),
    subscription("SUB_harbortrial", "active", "pro", 5, now + 7 * DAY),
    subscription("SUB_harborcompleted", "completed", "basic", 6, now - 600 * DAY),
  ];
}

/** The plan list, each plan with its subscriptions by id, as Paystack embeds them. */
function plans() {
  const all = subscriptions();
  return Object.values(PLANS).map((entry) => {
    const own = all
      .filter((subscription) => subscription.plan.id === entry.id)
      .map((subscription) => ({
        ...subscription,
        plan: entry.id,
        customer: subscription.customer.id,
      }));
    return { ...entry, subscriptions: own, total_subscriptions: own.length };
  });
}

function transactions() {
  const now = new Date();
  const [y, m] = [now.getUTCFullYear(), now.getUTCMonth()];
  const d = Math.min(now.getUTCDate(), 28);
  const ago = (days) => Date.now() - days * DAY;
  let next = 5_000_000_001;
  const entry = (at, amount, extra = {}) => ({
    id: next++,
    domain: "test",
    status: "success",
    reference: `ref${next}`,
    amount,
    message: null,
    gateway_response: "Successful",
    paid_at: iso(at),
    created_at: iso(at - 60_000),
    channel: "card",
    currency: "USD",
    ip_address: null,
    metadata: null,
    fees: Math.round(amount * 0.015),
    fees_split: null,
    customer: customer(9),
    plan: {},
    split: {},
    subaccount: {},
    order_id: null,
    paidAt: iso(at),
    createdAt: iso(at - 60_000),
    requested_amount: amount,
    source: null,
    connect: null,
    pos_transaction_data: null,
    ...extra,
  });
  const charge = (planKey, customerId, at, extra = {}) => {
    const { id, name, plan_code, description, amount, interval, currency } = PLANS[planKey];
    return entry(at, amount, {
      customer: customer(customerId),
      plan: { id, name, plan_code, description, amount, interval, currency },
      ...extra,
    });
  };
  return [
    ...Array.from({ length: 14 }, (_, k) => charge("monthly", 1, Date.UTC(y, m - k, 1))),
    charge("annual", 2, Date.UTC(y, m - 4, d)),
    charge("quarterly", 3, Date.UTC(y, m - 8, d)),
    charge("quarterly", 3, Date.UTC(y, m - 5, d)),
    charge("quarterly", 3, Date.UTC(y, m - 2, d), {
      status: "failed",
      paid_at: null,
      paidAt: null,
      gateway_response: "Insufficient Funds",
    }),
    charge("basic", 4, Date.UTC(y, m - 4, d)),
    charge("basic", 4, Date.UTC(y, m - 3, d)),
    { ...entry(ago(5), 5075, { requested_amount: 5000 }), id: 6_000_000_001 },
    { ...entry(ago(12), 3000, { status: "reversed" }), id: 6_000_000_002 },
    { ...entry(ago(15), 2500, { status: "reversed" }), id: 6_000_000_003 },
    { ...entry(ago(8), 4000), id: 6_000_000_004 },
    {
      ...entry(ago(3), 6000, { status: "abandoned", paid_at: null, paidAt: null }),
      id: 6_000_000_005,
    },
  ];
}

function refunds() {
  const ago = (days) => Date.now() - days * DAY;
  const refund = (id, transaction, amount, status, at) => ({
    id,
    integration: 100001,
    domain: "test",
    transaction,
    dispute: null,
    amount,
    deducted_amount: status === "processed" ? amount : null,
    currency: "USD",
    channel: "card",
    fully_deducted: status === "processed" ? 1 : null,
    refunded_by: "owner@example.test",
    refunded_at: status === "processed" ? iso(at) : null,
    status,
    created_at: iso(at),
    createdAt: iso(at),
  });
  return [
    refund(71, 6_000_000_002, 1000, "processed", ago(11)),
    refund(72, 6_000_000_003, 2500, "processed", ago(14)),
    refund(73, 6_000_000_004, 4000, "failed", ago(7)),
  ];
}

const created = (item) => Date.parse(item.createdAt ?? item.created_at);

/** A page of a list, newest first, with Paystack's offset pagination. */
function page(url, items, send) {
  const perPage = Number(url.searchParams.get("perPage") ?? 50);
  const number = Number(url.searchParams.get("page") ?? 1);
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > 1000 || number < 1)
    return send(400, { status: false, message: "Invalid pagination", code: "validation_error" });
  const sorted = [...items].sort((a, b) => created(b) - created(a));
  return send(200, {
    status: true,
    message: "Records retrieved",
    data: sorted.slice((number - 1) * perPage, number * perPage),
    meta: {
      total: sorted.length,
      skipped: (number - 1) * perPage,
      perPage,
      page: number,
      pageCount: Math.ceil(sorted.length / perPage),
    },
  });
}

/** The items created between the from and to dates, where given. */
function within(url, items, send) {
  const bound = (name) => {
    const value = url.searchParams.get(name);
    return value === null ? null : Date.parse(value);
  };
  const from = bound("from");
  const to = bound("to");
  if (Number.isNaN(from) || Number.isNaN(to))
    return {
      error: send(400, { status: false, message: "Invalid date", code: "validation_error" }),
    };
  return {
    items: items.filter(
      (item) => (from === null || created(item) >= from) && (to === null || created(item) <= to),
    ),
  };
}

export async function handlePaystack(url, request, response) {
  if (!url.pathname.startsWith("/paystack/")) return false;
  const send = (status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
    return true;
  };
  const [, , mode, ...rest] = url.pathname.split("/");
  const path = `/${rest.join("/")}`;
  if (request.method !== "GET")
    return send(405, { status: false, message: "Only reads are expected", code: "api_error" });
  const key = (request.headers.authorization ?? "").replace(/^Bearer /, "");
  const holder = keys[key];
  // A test key reads test data only, and these keys are all test keys.
  if (!holder || mode !== "test") return send(401, { status: false, message: "Invalid key" });
  const allowed = (scope) => holder.scopes === null || holder.scopes.includes(scope);
  const denied = () =>
    send(403, {
      status: false,
      message: "This key does not have the scope this endpoint requires",
      code: "api_error",
    });

  if (path === "/subscription") {
    if (!holder.subscriptions || !allowed("plans:read")) return denied();
    return page(url, subscriptions(), send);
  }
  if (path === "/plan") {
    if (!allowed("plans:read")) return denied();
    return page(url, plans(), send);
  }
  if (path === "/transaction") {
    if (!allowed("transactions:read")) return denied();
    const { items, error } = within(url, transactions(), send);
    if (error) return true;
    const status = url.searchParams.get("status");
    return page(
      url,
      items.filter((item) => !status || item.status === status),
      send,
    );
  }
  if (path === "/refund") {
    if (!allowed("disputes_refunds:read")) return denied();
    const { items, error } = within(url, refunds(), send);
    if (error) return true;
    return page(url, items, send);
  }
  return send(404, { status: false, message: `Unknown path ${path}` });
}
