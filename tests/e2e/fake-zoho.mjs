// A stand-in for Zoho's accounts server and the Zoho Billing API, for the tests only, under /zoho:
// /zoho/accounts/<data centre> for the accounts server and /zoho/api/<data centre> for the API, as
// the overrides ZOHO_ACCOUNTS_BASE and ZOHO_API_BASE expect. Approval starts in the US data centre
// (/com) and sends the founder back with the Indian one (/in), which alone exchanges codes and
// serves the API. Figures are placed relative to the current time, and EUR is 0.8 per USD.
//
// Approving access returns a code for a refresh token with the requested scopes; the refresh token
// of key "one" can only read. The account's default organization, Harbor Labs (USD), has: $29 and
// $5 a month for one customer, $240 a year, EUR 8 a month set not to renew ($10), $30 a quarter in
// dunning ($10 a month), a free plan, and a live subscription without a billing period, which is
// not counted. A trial, an unpaid and a cancelled subscription are not counted either. MRR is $74
// from 4 subscribers, with 7 subscriptions claimed and 1 not counted, and there is no history.
//
// Its payments: $29 three days ago, EUR 10 ten days ago ($12.50), $50 with $20 refunded twenty
// days ago ($30), $100 refunded in full forty days ago ($0), $240 a hundred days ago, and $15 in the
// organization's currency 400 days ago, without a currency of its own. A failed payment five days
// ago does not count. Revenue is $71.50 in the last 30 days, $311.50 in the last 12 months and
// $326.50 in all. Key "wide" refreshes with a scope that can change subscriptions, and is refused.
import { createHash, randomBytes } from "node:crypto";

const ORGANIZATION = "60012345678";
export const ZOHO = {
  clientId: "harbor-zoho-client",
  organization: ORGANIZATION,
  keys: {
    one: `in:${ORGANIZATION}:1000.harborzohorefresh.one0001`,
    wide: `in:${ORGANIZATION}:1000.harborzohorefresh.wide001`,
  },
};

const REFRESH = {
  "1000.harborzohorefresh.one0001": { access: "zoho_access_harbor_one", scope: null },
  "1000.harborzohorefresh.wide001": {
    access: "zoho_access_harbor_wide",
    scope: "ZohoSubscriptions.settings.READ,ZohoSubscriptions.subscriptions.UPDATE",
  },
};
const ACCESS = new Set(Object.values(REFRESH).map((refresh) => refresh.access));

// Codes waiting for their exchange, with the PKCE challenge, address and scopes they were issued for.
const codes = new Map();

const subscription = (id, customer, status, amount, interval, unit, currency) => ({
  subscription_id: id,
  subscription_number: id.toUpperCase(),
  name: `Harbor plan ${id}`,
  status,
  amount,
  interval,
  interval_unit: unit,
  currency_code: currency,
  currency_symbol: currency === "EUR" ? "€" : "$",
  customer_id: customer,
  customer_name: `Customer ${customer}`,
  created_at: "2025-01-15",
});

const SUBSCRIPTIONS = [
  subscription("sub_monthly", "cust_1", "live", 29, 1, "months", "USD"),
  subscription("sub_extra", "cust_1", "live", 5, 1, "months", "USD"),
  subscription("sub_yearly", "cust_2", "live", 240, 1, "years", "USD"),
  subscription("sub_free", "cust_5", "live", 0, 1, "months", "USD"),
  subscription("sub_unreadable", "cust_7", "live", 15, 1, "", "USD"),
  subscription("sub_cancelling", "cust_3", "non_renewing", 8, 1, "months", "EUR"),
  subscription("sub_dunning", "cust_4", "dunning", 30, 3, "months", "USD"),
  subscription("sub_unpaid", "cust_9", "unpaid", 29, 1, "months", "USD"),
  subscription("sub_trial", "cust_8", "trial", 29, 1, "months", "USD"),
  subscription("sub_cancelled", "cust_10", "cancelled", 29, 1, "months", "USD"),
];

// The statuses each filter lists. Past due lists unpaid subscriptions too, so the statuses are
// checked again by the reader.
const FILTERS = {
  "SubscriptionStatus.All": null,
  "SubscriptionStatus.LIVE": ["live"],
  "SubscriptionStatus.NON_RENEWING": ["non_renewing"],
  "SubscriptionStatus.PAST_DUE": ["dunning", "unpaid"],
  "SubscriptionStatus.TRIAL": ["trial"],
  "SubscriptionStatus.CANCELLED": ["cancelled"],
};

const DAY = 86_400_000;
const daysAgo = (days) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);

function payments() {
  const payment = (id, days, amount, extra = {}) => ({
    payment_id: id,
    invoice_number: `INV-${id}`,
    date: daysAgo(days),
    mode: "autotransaction",
    status: "success",
    amount,
    amount_refunded: 0,
    currency_code: "USD",
    customer_id: "cust_1",
    ...extra,
  });
  return [
    payment("pay_yearly", 100, 240),
    payment("pay_recent", 3, 29),
    payment("pay_failed", 5, 29, { status: "failure" }),
    payment("pay_eur", 10, 10, { currency_code: "EUR" }),
    payment("pay_partial", 20, 50, { amount_refunded: 20 }),
    payment("pay_refunded", 40, 100, { amount_refunded: 100 }),
    payment("pay_offline", 400, 15, { mode: "banktransfer", currency_code: undefined }),
  ];
}

const ORGANIZATIONS = [
  {
    organization_id: "60099999999",
    name: "Old Harbor",
    is_default_org: false,
    is_org_active: true,
    currency_code: "EUR",
  },
  {
    organization_id: ORGANIZATION,
    name: "Harbor Labs",
    is_default_org: true,
    is_org_active: true,
    currency_code: "USD",
  },
];

// Pages of three, so reads go through several pages, with Zoho's page context.
function page(url, key, items) {
  const number = Number(url.searchParams.get("page") ?? 1);
  const perPage = Math.min(Number(url.searchParams.get("per_page") ?? 200), 3);
  return {
    code: 0,
    message: "success",
    [key]: items.slice((number - 1) * perPage, number * perPage),
    page_context: {
      page: number,
      per_page: perPage,
      has_more_page: number * perPage < items.length,
    },
  };
}

async function readBody(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return new URLSearchParams(body);
}

export async function handleZoho(url, request, response) {
  if (!url.pathname.startsWith("/zoho/")) return false;
  const send = (status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
    return true;
  };
  const [, , server, dc, ...rest] = url.pathname.split("/");
  const path = `/${rest.join("/")}`;

  if (server === "accounts") {
    // The page where the founder approves access, which approves at once and sends them back
    // with the data centre their account is in.
    if (path === "/oauth/v2/auth") {
      const redirect = url.searchParams.get("redirect_uri");
      if (
        dc !== "com" ||
        url.searchParams.get("client_id") !== ZOHO.clientId ||
        url.searchParams.get("response_type") !== "code" ||
        url.searchParams.get("access_type") !== "offline" ||
        url.searchParams.get("code_challenge_method") !== "S256" ||
        !url.searchParams.get("scope") ||
        !redirect
      )
        return send(400, { error: "invalid_request" });
      const code = `1000.${randomBytes(12).toString("hex")}`;
      codes.set(code, {
        challenge: url.searchParams.get("code_challenge"),
        redirect,
        scope: url.searchParams.get("scope"),
      });
      const back = new URL(redirect);
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      back.searchParams.set("code", code);
      back.searchParams.set("location", "in");
      back.searchParams.set("accounts-server", "https://accounts.zoho.in");
      response.writeHead(302, { location: back.toString() });
      response.end();
      return true;
    }
    // Issuing tokens is the one request that is not a GET. Zoho answers failures with status 200.
    if (path === "/oauth/v2/token" && request.method === "POST") {
      const form = await readBody(request);
      if (dc !== "in") return send(200, { error: "invalid_client" });
      if (form.get("client_id") !== ZOHO.clientId || !form.get("client_secret"))
        return send(200, { error: "invalid_client" });
      const tokens = (refreshToken, scope) => ({
        access_token: REFRESH[refreshToken].access,
        ...(scope ? { scope } : {}),
        api_domain: "https://www.zohoapis.in",
        token_type: "Bearer",
        expires_in: 3600,
      });
      if (form.get("grant_type") === "authorization_code") {
        const issued = codes.get(form.get("code") ?? "");
        codes.delete(form.get("code") ?? "");
        const challenge = createHash("sha256")
          .update(form.get("code_verifier") ?? "")
          .digest("base64url");
        if (
          !issued ||
          form.get("redirect_uri") !== issued.redirect ||
          challenge !== issued.challenge
        )
          return send(200, { error: "invalid_code" });
        // A grant that can do more than read gets the refresh token of key "wide".
        const reads = issued.scope.split(",").every((scope) => scope.endsWith(".READ"));
        const refreshToken = reads
          ? "1000.harborzohorefresh.one0001"
          : "1000.harborzohorefresh.wide001";
        return send(200, { ...tokens(refreshToken, issued.scope), refresh_token: refreshToken });
      }
      if (form.get("grant_type") === "refresh_token") {
        const refreshToken = form.get("refresh_token") ?? "";
        if (!REFRESH[refreshToken]) return send(200, { error: "invalid_code" });
        return send(200, tokens(refreshToken, REFRESH[refreshToken].scope));
      }
      return send(200, { error: "unsupported_grant_type" });
    }
    return send(404, { error: "not_found" });
  }

  if (server !== "api" || !path.startsWith("/billing/v1/"))
    return send(404, { code: 5, message: "Invalid URL Passed" });
  if (request.method !== "GET")
    return send(405, { code: 37, message: "The HTTP method is not allowed." });
  const token = (request.headers.authorization ?? "").replace(/^Zoho-oauthtoken /, "");
  if (dc !== "in" || !ACCESS.has(token))
    return send(401, { code: 57, message: "You are not authorized to perform this operation" });
  const resource = path.slice("/billing/v1".length);
  if (resource === "/organizations")
    return send(200, { code: 0, message: "success", organizations: ORGANIZATIONS });
  if (request.headers["x-com-zoho-subscriptions-organizationid"] !== ORGANIZATION)
    return send(400, { code: 6041, message: "This organization does not exist." });
  if (resource === "/subscriptions") {
    const filter = url.searchParams.get("filter_by") ?? "SubscriptionStatus.All";
    if (!(filter in FILTERS))
      return send(400, { code: 2, message: "Invalid value passed for filter_by" });
    const statuses = FILTERS[filter];
    const listed = SUBSCRIPTIONS.filter((s) => !statuses || statuses.includes(s.status));
    return send(200, page(url, "subscriptions", listed));
  }
  if (resource === "/payments") return send(200, page(url, "payments", payments()));
  return send(404, { code: 5, message: "Invalid URL Passed" });
}
