// A stand-in for Mollie's API, for the tests only, under /mollie. Both tokens are advanced access
// tokens limited to test mode, so a request without testmode=true is refused, and both read the
// website profile MOLLIE.profile only. Lists give at most five items a page, so reads follow the
// cursor. Figures are placed relative to the current time, and EUR is 0.8 per USD.
//
// Token "one" holds read permissions only. Its active subscriptions: EUR 20 a month, charged on the
// 1st for 14 months ($25 a month); EUR 60 every 3 months, charged five and two months ago ($25);
// and USD 120 every 12 months, which starts ten months from now and whose customer paid USD 120 for
// the first year with a first payment two months ago ($10). A EUR 30 monthly subscription that
// starts in ten days, after a first payment of nothing that only set up the mandate, is a trial;
// one of EUR 15 a month was canceled after two payments, and a pending one is not counted. MRR is
// $60 from 3 subscribers (EUR 40 and USD 10). The month-ends give $25 a year back, $50 at the
// end of the month five months back, $68.75 at the ends of the next two (the canceled one adds
// $18.75), and $60 for the last two; MRR from payments is $60 now and thirty days ago.
//
// For revenue, besides those payments: a one-off EUR 121 with EUR 21 of VAT on its lines (EUR 100),
// one of USD 30 with USD 10 refunded (USD 20), one of EUR 25 refunded in full (EUR 0), one of USD
// 40 charged back (USD 0), and a failed and an open one, which do not count. Token "wide" can also
// create payments, and is refused.

export const MOLLIE = {
  profile: "pfl_HarborOne1",
  tokens: { one: "access_HarborMollieOneToken0001", wide: "access_HarborMollieWideToken001" },
};

const READS = ["payments.read", "subscriptions.read", "profiles.read", "refunds.read"];
const tokens = [
  { token: MOLLIE.tokens.one, granted: READS },
  { token: MOLLIE.tokens.wide, granted: [...READS, "payments.write", "refunds.write"] },
];
const PERMISSIONS = [
  "customers.read",
  "customers.write",
  "invoices.read",
  "mandates.read",
  "mandates.write",
  "onboarding.read",
  "onboarding.write",
  "orders.read",
  "orders.write",
  "organizations.read",
  "organizations.write",
  "payment-links.read",
  "payment-links.write",
  "payments.read",
  "payments.write",
  "profiles.read",
  "profiles.write",
  "refunds.read",
  "refunds.write",
  "settlements.read",
  "shipments.read",
  "shipments.write",
  "subscriptions.read",
  "subscriptions.write",
];

const DAY = 86_400_000;
const PAGE = 5;
const API = "https://api.mollie.com/v2";
// Mollie's own format, with the offset written out.
const mollieTime = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "+00:00");
const date = (ms) => new Date(ms).toISOString().slice(0, 10);
const money = (value, currency = "EUR") => ({ currency, value });
const link = (href) => ({ href, type: "application/hal+json" });

function data() {
  const now = new Date();
  const [y, m] = [now.getUTCFullYear(), now.getUTCMonth()];
  const d = Math.min(now.getUTCDate(), 28);
  const ago = (days) => Date.now() - days * DAY;
  const subscription = (id, customerId, status, amount, interval, start, extra = {}) => ({
    resource: "subscription",
    id,
    mode: "test",
    status,
    amount,
    times: null,
    timesRemaining: null,
    interval,
    startDate: date(start),
    description: `Harbor ${id}`,
    method: null,
    metadata: null,
    webhookUrl: null,
    customerId,
    mandateId: `mdt_${customerId.slice(4)}`,
    createdAt: mollieTime(Math.min(start, Date.now())),
    _links: { self: link(`${API}/customers/${customerId}/subscriptions/${id}`) },
    ...extra,
  });
  const subscriptions = [
    subscription(
      "sub_HarborMonthly",
      "cst_HarborA",
      "active",
      money("20.00"),
      "1 month",
      Date.UTC(y, m - 13, 1),
      { nextPaymentDate: date(Date.UTC(y, m + 1, 1)) },
    ),
    subscription(
      "sub_HarborQuarter",
      "cst_HarborB",
      "active",
      money("60.00"),
      "3 months",
      Date.UTC(y, m - 5, d),
    ),
    subscription(
      "sub_HarborYearly",
      "cst_HarborC",
      "active",
      money("120.00", "USD"),
      "12 months",
      Date.UTC(y + 1, m - 2, d),
      { createdAt: mollieTime(Date.UTC(y, m - 2, d) + 900_000) },
    ),
    subscription("sub_HarborTrial", "cst_HarborD", "active", money("30.00"), "1 month", ago(-10), {
      createdAt: mollieTime(ago(4)),
    }),
    subscription(
      "sub_HarborEnded",
      "cst_HarborE",
      "canceled",
      money("15.00"),
      "1 month",
      Date.UTC(y, m - 4, d),
      { canceledAt: mollieTime(Date.UTC(y, m - 2, d)) },
    ),
    subscription(
      "sub_HarborPending",
      "cst_HarborF",
      "pending",
      money("50.00", "USD"),
      "1 month",
      ago(0),
    ),
  ];
  const payment = (id, at, amount, extra = {}) => {
    const status = extra.status ?? "paid";
    return {
      resource: "payment",
      id,
      mode: "test",
      createdAt: mollieTime(at),
      amount,
      amountRefunded: money("0.00", amount.currency),
      description: `Harbor ${id}`,
      method: "creditcard",
      metadata: null,
      status,
      ...(status === "paid" && { paidAt: mollieTime(at + 60_000) }),
      sequenceType: "oneoff",
      customerId: null,
      subscriptionId: null,
      mandateId: null,
      profileId: MOLLIE.profile,
      _links: { self: link(`${API}/payments/${id}`) },
      ...extra,
    };
  };
  const recurring = (id, at, amount, subscriptionId, customerId) =>
    payment(id, at, amount, { sequenceType: "recurring", subscriptionId, customerId });
  const payments = [
    ...Array.from({ length: 14 }, (_, k) =>
      recurring(
        `tr_HarborMonthly${k}`,
        Date.UTC(y, m - k, 1),
        money("20.00"),
        "sub_HarborMonthly",
        "cst_HarborA",
      ),
    ),
    recurring(
      "tr_HarborQuarter1",
      Date.UTC(y, m - 5, d),
      money("60.00"),
      "sub_HarborQuarter",
      "cst_HarborB",
    ),
    recurring(
      "tr_HarborQuarter2",
      Date.UTC(y, m - 2, d),
      money("60.00"),
      "sub_HarborQuarter",
      "cst_HarborB",
    ),
    recurring(
      "tr_HarborEnded1",
      Date.UTC(y, m - 4, d),
      money("15.00"),
      "sub_HarborEnded",
      "cst_HarborE",
    ),
    recurring(
      "tr_HarborEnded2",
      Date.UTC(y, m - 3, d),
      money("15.00"),
      "sub_HarborEnded",
      "cst_HarborE",
    ),
    payment("tr_HarborYearFirst", Date.UTC(y, m - 2, d) + 600_000, money("120.00", "USD"), {
      sequenceType: "first",
      customerId: "cst_HarborC",
    }),
    payment("tr_HarborMandate", ago(4), money("0.00"), {
      sequenceType: "first",
      customerId: "cst_HarborD",
    }),
    payment("tr_HarborOnce", ago(5), money("121.00"), {
      lines: [
        {
          type: "digital",
          description: "Lifetime licence",
          quantity: 1,
          unitPrice: money("121.00"),
          totalAmount: money("121.00"),
          vatRate: "21.00",
          vatAmount: money("21.00"),
        },
      ],
    }),
    payment("tr_HarborPartial", ago(12), money("30.00", "USD"), {
      amountRefunded: money("10.00", "USD"),
    }),
    payment("tr_HarborRefunded", ago(15), money("25.00"), { amountRefunded: money("25.00") }),
    payment("tr_HarborChargeback", ago(20), money("40.00", "USD"), {
      amountChargedBack: money("40.00", "USD"),
    }),
    payment("tr_HarborFailed", ago(3), money("99.00", "USD"), { status: "failed" }),
    payment("tr_HarborOpen", ago(1), money("10.00"), { status: "open" }),
  ];
  payments.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return { subscriptions, payments };
}

/** One page of a list from the `from` cursor, with a link to the next page as Mollie gives it. */
function page(url, key, items) {
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 250);
  const from = url.searchParams.get("from");
  const start = from ? items.findIndex((item) => item.id === from) : 0;
  if (start < 0) return null;
  const size = Math.min(limit, PAGE);
  const slice = items.slice(start, start + size);
  const next = items[start + size];
  const nextUrl = new URL(`${API}/${key}`);
  for (const [name, value] of url.searchParams)
    if (name !== "from") nextUrl.searchParams.set(name, value);
  if (next) nextUrl.searchParams.set("from", next.id);
  return {
    count: slice.length,
    _embedded: { [key]: slice },
    _links: {
      self: link(`${API}/${key}`),
      previous: null,
      next: next ? link(nextUrl.toString()) : null,
      documentation: { href: "https://docs.mollie.com/", type: "text/html" },
    },
  };
}

export async function handleMollie(url, request, response) {
  if (!url.pathname.startsWith("/mollie/")) return false;
  const send = (status, body) => {
    response.writeHead(status, { "content-type": "application/hal+json" });
    response.end(JSON.stringify(body));
    return true;
  };
  const error = (status, title, detail, extra = {}) =>
    send(status, { status, title, detail, ...extra });
  const path = url.pathname.slice("/mollie".length);
  if (request.method !== "GET")
    return error(405, "Method Not Allowed", "Only reads are expected from this app.");
  const authorization = request.headers.authorization ?? "";
  const holder = tokens.find((t) => authorization === `Bearer ${t.token}`);
  if (!holder)
    return error(401, "Unauthorized Request", "Missing authentication, or failed to authenticate");

  if (path === "/v2/permissions") {
    const permissions = PERMISSIONS.map((id) => ({
      resource: "permission",
      id,
      description: id,
      granted: holder.granted.includes(id),
      _links: { self: link(`${API}/permissions/${id}`) },
    }));
    return send(200, {
      count: permissions.length,
      _embedded: { permissions },
      _links: { self: link(`${API}/permissions`) },
    });
  }

  const lists = { "/v2/subscriptions": "subscriptions", "/v2/payments": "payments" };
  const key = lists[path];
  if (!key) return error(404, "Not Found", `Unknown path ${path}`);
  if (url.searchParams.get("testmode") !== "true")
    return error(403, "Forbidden", "This access token is limited to test mode.");
  const profile = url.searchParams.get("profileId");
  if (!profile)
    return error(422, "Unprocessable Entity", "The profile ID is required for this token.", {
      field: "profileId",
    });
  if (profile !== MOLLIE.profile) return error(404, "Not Found", "The profile could not be found.");
  const items = data()[key];
  if (key === "payments" && url.searchParams.get("sort") === "asc") items.reverse();
  const result = page(url, key, items);
  if (!result) return error(400, "Bad Request", "Invalid cursor.", { field: "from" });
  return send(200, result);
}
