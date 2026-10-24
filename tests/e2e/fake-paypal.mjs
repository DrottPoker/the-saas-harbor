// A stand-in for PayPal's API, for the tests only, under /paypal with /live or /sandbox for the
// environment, as the app's override expects. Both apps are sandbox apps, so the live address
// refuses them. Figures are placed relative to the current time, and EUR is 0.8 per USD.
//
// App "one" can only search transactions. Its subscriptions: $20 a month on the 1st for 14 months;
// EUR 120 a year with EUR 20 of tax, paid once four months ago (EUR 100, counted as yearly, $10.42
// a month); $30 a quarter, paid five and two months ago ($10 a month); $15 a month, paid four and
// three months ago and ended since; one refunded in full ten days ago; and a $9.99 subscription the
// account pays itself. MRR is $40.42 from 3 subscribers, 1 of them counted as yearly. The payments
// give $20 at the month-end a year back, and $40.42 now and thirty days ago.
//
// For revenue, besides the subscriptions: a $50 checkout payment with $10 of tax ($40), a $30 one
// with $10 refunded ($20), one of $25 refunded in full ($0), and a $5 donation and a withdrawal,
// which are not sales. App "wide" can also take payments, and is refused.

export const PAYPAL = {
  one: { clientId: "harborPayPalClientOne0001", secret: "harborPayPalSecretOne00001" },
  wide: { clientId: "harborPayPalClientWide001", secret: "harborPayPalSecretWide0001" },
};

const SEARCH = "https://uri.paypal.com/services/reporting/search/read";
const apps = [
  {
    ...PAYPAL.one,
    token: "paypal_token_harbor_one",
    scopes: [SEARCH, "https://uri.paypal.com/services/reporting/balances/read", "openid"],
  },
  {
    ...PAYPAL.wide,
    token: "paypal_token_harbor_wide",
    scopes: [SEARCH, "https://uri.paypal.com/services/payments/payment/authcapture", "openid"],
  },
];

const DAY = 86_400_000;
// PayPal's own format, with the offset written without a colon.
const paypalTime = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "+0000");
const money = (value, currency = "USD") => ({ currency_code: currency, value });

function transactions() {
  const now = new Date();
  const [y, m] = [now.getUTCFullYear(), now.getUTCMonth()];
  const d = Math.min(now.getUTCDate(), 28);
  const ago = (days) => Date.now() - days * DAY;
  const entry = (id, at, code, amount, extra = {}) => ({
    transaction_id: id,
    transaction_event_code: code,
    transaction_initiation_date: paypalTime(at),
    transaction_updated_date: paypalTime(at),
    transaction_amount: amount,
    fee_amount: money("-0.50", amount.currency_code),
    transaction_status: "S",
    ...extra,
  });
  const subscription = (id, subscription, at, amount, extra = {}) =>
    entry(id, at, "T0002", amount, {
      paypal_reference_id: subscription,
      paypal_reference_id_type: "SUB",
      ...extra,
    });
  return [
    ...Array.from({ length: 14 }, (_, k) =>
      subscription(`PPMONTHLY${k}`, "I-MONTHLY", Date.UTC(y, m - k, 1), money("20.00")),
    ),
    subscription("PPYEARLY", "I-YEARLY", Date.UTC(y, m - 4, d), money("120.00", "EUR"), {
      sales_tax_amount: money("20.00", "EUR"),
    }),
    subscription("PPQUARTER1", "I-QUARTERLY", Date.UTC(y, m - 5, d), money("30.00")),
    subscription("PPQUARTER2", "I-QUARTERLY", Date.UTC(y, m - 2, d), money("30.00")),
    subscription("PPENDED1", "I-ENDED", Date.UTC(y, m - 4, d), money("15.00")),
    subscription("PPENDED2", "I-ENDED", Date.UTC(y, m - 3, d), money("15.00")),
    subscription("PPSUBREFUND", "I-REFUNDED", ago(10), money("12.00"), {
      transaction_status: "V",
    }),
    subscription("PPOUTGOING", "I-OUTGOING", ago(8), money("-9.99")),
    entry("PPCHECKOUT", ago(5), "T0006", money("50.00"), { sales_tax_amount: money("10.00") }),
    entry("PPPARTIAL", ago(12), "T0006", money("30.00")),
    entry("PPPARTIALREFUND", ago(11), "T1107", money("-10.00"), {
      paypal_reference_id: "PPPARTIAL",
      paypal_reference_id_type: "TXN",
    }),
    entry("PPREFUNDED", ago(15), "T0007", money("25.00"), { transaction_status: "V" }),
    entry("PPDONATION", ago(6), "T0013", money("5.00")),
    entry("PPWITHDRAWAL", ago(4), "T0400", money("-100.00")),
  ];
}

async function readBody(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return new URLSearchParams(body);
}

const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const parseTime = (value) => Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));

function search(url, app, send) {
  const startDate = url.searchParams.get("start_date") ?? "";
  const endDate = url.searchParams.get("end_date") ?? "";
  const invalid = (message) =>
    send(400, { name: "INVALID_REQUEST", message, details: [{ issue: "INVALID_REQUEST" }] });
  if (!TIME.test(startDate) || !TIME.test(endDate)) return invalid("Dates must have seconds.");
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  if (end < start || end - start > 31 * DAY) return invalid("The range is at most 31 days.");
  const limit = new Date();
  limit.setUTCFullYear(limit.getUTCFullYear() - 3);
  if (start < limit.getTime()) return invalid("Data for the given start date is not available.");
  const pageSize = Number(url.searchParams.get("page_size") ?? 100);
  const page = Number(url.searchParams.get("page") ?? 1);
  if (pageSize > 500 || page < 1) return invalid("Page out of range.");
  if (url.searchParams.get("fields") !== "transaction_info")
    return invalid("Only transaction details are expected.");
  const type = url.searchParams.get("transaction_type");
  const items = transactions().filter((transaction) => {
    const at = parseTime(transaction.transaction_initiation_date);
    return at >= start && at <= end && (!type || transaction.transaction_event_code === type);
  });
  return send(200, {
    transaction_details: items
      .slice((page - 1) * pageSize, page * pageSize)
      .map((transaction_info) => ({ transaction_info })),
    account_number: "HARBORMERCHANT1",
    page,
    total_items: items.length,
    total_pages: Math.ceil(items.length / pageSize),
  });
}

export async function handlePayPal(url, request, response) {
  if (!url.pathname.startsWith("/paypal/")) return false;
  const send = (status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
    return true;
  };
  const [, , environment, ...rest] = url.pathname.split("/");
  const path = `/${rest.join("/")}`;
  const authorization = request.headers.authorization ?? "";

  // Issuing a token is the one request that is not a GET.
  if (path === "/v1/oauth2/token" && request.method === "POST") {
    const form = await readBody(request);
    if (form.get("grant_type") !== "client_credentials")
      return send(400, { error: "unsupported_grant_type" });
    const [clientId, secret] = Buffer.from(authorization.replace(/^Basic /, ""), "base64")
      .toString("utf8")
      .split(":");
    const app = apps.find((a) => a.clientId === clientId && a.secret === secret);
    if (!app || environment !== "sandbox")
      return send(401, {
        error: "invalid_client",
        error_description: "Client Authentication failed",
      });
    return send(200, {
      scope: app.scopes.join(" "),
      access_token: app.token,
      token_type: "Bearer",
      app_id: "APP-HARBORFIXTURE",
      expires_in: 32400,
    });
  }
  if (request.method !== "GET") return send(405, { name: "METHOD_NOT_SUPPORTED" });
  const app = apps.find((a) => authorization === `Bearer ${a.token}`);
  if (!app || environment !== "sandbox")
    return send(401, {
      error: "invalid_token",
      error_description: "Token signature verification failed",
    });
  if (path === "/v1/reporting/transactions") {
    if (!app.scopes.includes(SEARCH))
      return send(403, {
        name: "NOT_AUTHORIZED",
        message: "Authorization failed due to insufficient permissions.",
      });
    return search(url, app, send);
  }
  return send(404, { name: "RESOURCE_NOT_FOUND", message: `Unknown path ${path}` });
}
