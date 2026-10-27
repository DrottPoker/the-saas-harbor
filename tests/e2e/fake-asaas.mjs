// A stand-in for Asaas's API, for the tests only, under /asaas with /live or /sandbox for the
// environment, as the override expects. Both keys are Sandbox keys, so the live address refuses
// them. Figures are placed relative to the current time, in BRL; at 5 BRL per USD, R$ 5 is $1.
//
// Key "one" can read subscriptions and charges only. Its active subscriptions: R$ 99.90 a month,
// paid on the 1st for 14 months; R$ 1,200 a year at 10% off, paid five months ago (R$ 1,080, so
// R$ 90 a month); R$ 300 a quarter, paid four months and one month ago (R$ 100 a month), by the
// same customer as the monthly one; and R$ 50 a month whose charges are overdue, which is not
// counted. An ended subscription paid R$ 40 a month from twelve to seven months ago. MRR is
// R$ 289.90 ($57.98) from 2 subscribers, with 1 active subscription not counted. The month-end
// history is $27.98 for six months, then $19.98, $37.98, and $57.98 for the last four months, and
// $57.98 thirty days ago.
//
// For revenue, besides the paid subscription charges: R$ 200 through a payment link five days ago,
// R$ 150 with R$ 50 refunded eight days ago (R$ 100), R$ 80 refunded in full twelve days ago (R$ 0),
// and a card charge of R$ 60 confirmed two days ago. A Pix transfer of R$ 5,000 into the account
// and a charge marked received in cash are not sales. Key "wide" was created without permissions,
// so it can read transfers and customers too, and is refused.

export const ASAAS = {
  one: "$aact_hmlg_000HarborFixtureOneMzkwODA2MWY2OGM3MWRlMDU2NWM3MzJl",
  wide: "$aact_hmlg_000HarborFixtureWideMzkwODA2MWY2OGM3MWRlMDU2NWM3Mz",
};

const DAY = 86_400_000;
const date = (ms) => new Date(ms).toISOString().slice(0, 10);

function fixtures() {
  const now = new Date();
  const [y, m] = [now.getUTCFullYear(), now.getUTCMonth()];
  const d = Math.min(now.getUTCDate(), 28);
  const today = Date.UTC(y, m, now.getUTCDate());
  const subscription = (id, customer, value, cycle, extra = {}) => ({
    object: "subscription",
    id,
    dateCreated: date(Date.UTC(y - 2, m, 1)),
    customer,
    billingType: "PIX",
    cycle,
    value,
    nextDueDate: date(Date.UTC(y, m + 1, 1)),
    status: "ACTIVE",
    discount: { value: 0, dueDateLimitDays: 0, type: "FIXED" },
    deleted: false,
    ...extra,
  });
  const charge = (id, customer, value, dueMs, extra = {}) => ({
    object: "payment",
    id,
    dateCreated: date(dueMs - 40 * DAY),
    customer,
    subscription: null,
    paymentLink: null,
    value,
    netValue: value - 1.99,
    originalValue: null,
    description: null,
    billingType: "PIX",
    status: "RECEIVED",
    dueDate: date(dueMs),
    originalDueDate: date(dueMs),
    paymentDate: date(dueMs),
    clientPaymentDate: date(dueMs),
    pixTransaction: null,
    pixQrCodeId: null,
    deleted: false,
    refunds: null,
    ...extra,
  });
  const ofSubscription =
    (subscriptionId) =>
    (id, customer, value, dueMs, extra = {}) =>
      charge(id, customer, value, dueMs, { subscription: subscriptionId, ...extra });
  const unpaid = { status: "OVERDUE", paymentDate: null, clientPaymentDate: null };

  const monthly = ofSubscription("sub_harborMonthly");
  const yearly = ofSubscription("sub_harborYearly");
  const quarterly = ofSubscription("sub_harborQuarterly");
  const overdue = ofSubscription("sub_harborOverdue");
  const ended = ofSubscription("sub_harborEnded");
  const subscriptions = [
    subscription("sub_harborMonthly", "cus_harborA", 99.9, "MONTHLY"),
    subscription("sub_harborYearly", "cus_harborB", 1200, "YEARLY", {
      discount: { value: 10, dueDateLimitDays: 0, type: "PERCENTAGE" },
    }),
    subscription("sub_harborQuarterly", "cus_harborA", 300, "QUARTERLY"),
    subscription("sub_harborOverdue", "cus_harborC", 50, "MONTHLY"),
    subscription("sub_harborEnded", "cus_harborD", 40, "MONTHLY", { status: "INACTIVE" }),
  ];
  const payments = [
    ...Array.from({ length: 14 }, (_, k) =>
      monthly(`pay_monthly${k}`, "cus_harborA", 99.9, Date.UTC(y, m - k, 1)),
    ),
    monthly("pay_monthlyNext", "cus_harborA", 99.9, Date.UTC(y, m + 1, 1), {
      status: "PENDING",
      paymentDate: null,
      clientPaymentDate: null,
    }),
    yearly("pay_yearly", "cus_harborB", 1080, Date.UTC(y, m - 5, d), { originalValue: 1200 }),
    quarterly("pay_quarter1", "cus_harborA", 300, Date.UTC(y, m - 4, d)),
    quarterly("pay_quarter2", "cus_harborA", 300, Date.UTC(y, m - 1, d)),
    overdue("pay_overdue1", "cus_harborC", 50, Date.UTC(y, m - 2, 1), unpaid),
    overdue("pay_overdue2", "cus_harborC", 50, Date.UTC(y, m - 1, 1), unpaid),
    ...Array.from({ length: 6 }, (_, k) =>
      ended(`pay_ended${k}`, "cus_harborD", 40, Date.UTC(y, m - 7 - k, 1)),
    ),
    charge("pay_link", "cus_harborE", 200, today - 5 * DAY, { paymentLink: "link_harbor" }),
    charge("pay_partial", "cus_harborE", 150, today - 8 * DAY, {
      billingType: "CREDIT_CARD",
      refunds: [{ dateCreated: date(today - 6 * DAY), status: "DONE", value: 50 }],
    }),
    charge("pay_refunded", "cus_harborE", 80, today - 12 * DAY, { status: "REFUNDED" }),
    charge("pay_card", "cus_harborE", 60, today - 2 * DAY, {
      billingType: "CREDIT_CARD",
      status: "CONFIRMED",
    }),
    charge("pay_pixIn", "cus_harborF", 5000, today - 6 * DAY, {
      description: "Cobrança criada automaticamente a partir de Pix recebido.",
      pixTransaction: "35363f6e-93e2-11ec-b9d9-96f4053b1bd4",
    }),
    charge("pay_cash", "cus_harborE", 300, today - 7 * DAY, { status: "RECEIVED_IN_CASH" }),
  ];
  return { subscriptions, payments };
}

/** A page in Asaas's shape, by offset, at most 100 long. */
function listPage(url, items) {
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 10));
  const data = items.slice(offset, offset + limit);
  return {
    object: "list",
    hasMore: offset + limit < items.length,
    totalCount: items.length,
    limit,
    offset,
    data,
  };
}

/** Whether a YYYY-MM-DD value passes the [ge] and [le] filters of a field. */
function inRange(url, field, value) {
  const ge = url.searchParams.get(`${field}[ge]`);
  const le = url.searchParams.get(`${field}[le]`);
  if (!ge && !le) return true;
  if (!value) return false;
  return (!ge || value >= ge) && (!le || value <= le);
}

export function handleAsaas(url, request, response) {
  if (!url.pathname.startsWith("/asaas/")) return false;
  const send = (status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
    return true;
  };
  const error = (status, code, description) => send(status, { errors: [{ code, description }] });
  const [, , environment, ...rest] = url.pathname.split("/");
  const path = `/${rest.join("/")}`;
  if (request.method !== "GET") return send(405, {});
  const key = request.headers.access_token;
  if (!key)
    return error(
      401,
      "access_token_not_found",
      "The 'access_token' authentication header is required and was not found in the request",
    );
  if (!request.headers["user-agent"])
    return error(400, "invalid_user_agent", "Send a User-Agent that names your application");
  if (key !== ASAAS.one && key !== ASAAS.wide)
    return error(401, "invalid_access_token", "The provided API key is invalid");
  if (environment !== "sandbox")
    return error(
      401,
      "invalid_environment",
      "The provided API key does not belong to this environment",
    );

  // A key with full access reads everything; key "one" only subscriptions and charges.
  const scopes = { "/v3/transfers": "TRANSFER", "/v3/customers": "CUSTOMER" };
  if (scopes[path]) {
    if (key === ASAAS.wide) return send(200, listPage(url, []));
    return error(
      403,
      "insufficient_permission",
      `The provided API key does not have the required permissions. Check that the key has the ${scopes[path]}:READ scope to access the requested resource`,
    );
  }
  const { subscriptions, payments } = fixtures();
  if (path === "/v3/subscriptions") {
    const status = url.searchParams.get("status");
    const items = subscriptions.filter(
      (subscription) =>
        (!status || subscription.status === status) &&
        (!subscription.deleted || url.searchParams.get("includeDeleted") === "true"),
    );
    return send(200, listPage(url, items));
  }
  if (path === "/v3/payments") {
    const status = url.searchParams.get("status");
    const subscription = url.searchParams.get("subscription");
    const items = payments.filter(
      (payment) =>
        (!status || payment.status === status) &&
        (!subscription || payment.subscription === subscription) &&
        inRange(url, "dueDate", payment.dueDate) &&
        inRange(url, "paymentDate", payment.paymentDate),
    );
    return send(200, listPage(url, items));
  }
  return error(404, "not_found", `Unknown path ${path}`);
}
