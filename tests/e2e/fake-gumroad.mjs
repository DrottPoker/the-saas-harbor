// A stand-in for Gumroad's OAuth pages and API, for the tests only, under /gumroad. Figures are
// placed relative to the current time, and every amount is in US cents.
//
// Approving access returns a code for a token that can only view sales. The account sells a
// membership: $20 a month for 14 months, $240 a year paid 100 days ago, $10 a month set to cancel
// (paid three times), a subscriber in a free trial, and one whose last payment is too old to find.
// MRR is $50 from 3 customers, with 1 subscriber not counted. An upgrade 5 days ago charged $7
// for part of a period, and the old subscriber paid $20 800 days ago. It also sells an ebook: $15
// two days ago, and $30 six days ago, refunded in full. Revenue is $592 in all. The token "wide"
// can also edit products and is refused.
import { createHash, randomBytes } from "node:crypto";

export const GUMROAD = {
  clientId: "harbor-test-client",
  user: "gum_user_harbor",
  tokens: { one: "gumroad_harborfixture_token_0001", wide: "gumroad_harborfixture_token_wide" },
};

const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();
const monthStarts = (count) => {
  const now = new Date();
  return Array.from({ length: count }, (_, k) =>
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1, 9),
  );
};

// Codes waiting for their exchange, with the PKCE challenge and address they were issued for.
const codes = new Map();

const products = () => [
  {
    id: "prod_member",
    name: "Harbor membership",
    is_tiered_membership: true,
    recurrences: ["monthly", "yearly"],
    subscription_duration: null,
  },
  {
    id: "prod_ebook",
    name: "Harbor ebook",
    is_tiered_membership: false,
    recurrences: null,
    subscription_duration: null,
  },
];

function subscribers() {
  const now = Date.now();
  const subscriber = (id, user, status, recurrence, extra = {}) => ({
    id,
    product_id: "prod_member",
    product_name: "Harbor membership",
    user_id: user,
    user_email: `${user}@example.test`,
    status,
    recurrence,
    created_at: iso(now - 400 * DAY),
    cancelled_at: null,
    ended_at: null,
    failed_at: null,
    free_trial_ends_at: null,
    charge_occurrence_count: null,
    ...extra,
  });
  return [
    subscriber("sub_monthly", "gu_1", "alive", "monthly"),
    subscriber("sub_yearly", "gu_2", "alive", "yearly"),
    subscriber("sub_cancelling", "gu_3", "pending_cancellation", "monthly", {
      cancelled_at: iso(now + 20 * DAY),
    }),
    subscriber("sub_trial", "gu_4", "alive", "monthly", { free_trial_ends_at: iso(now + 4 * DAY) }),
    subscriber("sub_old", "gu_5", "alive", "monthly"),
  ];
}

// Every sale, newest first, as the sales list gives them.
function sales() {
  const now = Date.now();
  const sale = (id, product, created, price, extra = {}) => ({
    id,
    product_id: product,
    product_name: product === "prod_member" ? "Harbor membership" : "Harbor ebook",
    created_at: iso(created),
    price,
    currency: "usd",
    refunded: false,
    partially_refunded: false,
    chargedback: false,
    is_upgrade_purchase: false,
    subscription_id: null,
    subscription_duration: null,
    ...extra,
  });
  const member = (id, subscription, created, price, recurrence, extra = {}) =>
    sale(id, "prod_member", created, price, {
      subscription_id: subscription,
      subscription_duration: recurrence,
      ...extra,
    });
  const list = [
    ...monthStarts(14).map((start, k) =>
      member(`sale_monthly_${k}`, "sub_monthly", start, 2000, "monthly"),
    ),
    member("sale_yearly", "sub_yearly", now - 100 * DAY, 24000, "yearly"),
    ...[0, 1, 2].map((k) =>
      member(`sale_cancelling_${k}`, "sub_cancelling", now - (5 + 30 * k) * DAY, 1000, "monthly"),
    ),
    member("sale_upgrade", "sub_monthly", now - 5 * DAY, 700, "monthly", {
      is_upgrade_purchase: true,
    }),
    member("sale_trial", "sub_trial", now - 3 * DAY, 0, "monthly"),
    member("sale_old", "sub_old", now - 800 * DAY, 2000, "monthly"),
    sale("sale_ebook", "prod_ebook", now - 2 * DAY, 1500),
    sale("sale_ebook_refunded", "prod_ebook", now - 6 * DAY, 3000, { refunded: true }),
  ];
  return list.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

// Pages of ten, as Gumroad's lists come, with the next page's key.
function page(url, key, items, size = 10) {
  const offset = Number(url.searchParams.get("page_key") ?? 0);
  const next = offset + size < items.length ? String(offset + size) : undefined;
  return { success: true, [key]: items.slice(offset, offset + size), next_page_key: next };
}

async function readBody(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return new URLSearchParams(body);
}

export async function handleGumroad(url, request, response) {
  if (!url.pathname.startsWith("/gumroad/")) return false;
  const send = (status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
    return true;
  };
  const path = url.pathname.slice("/gumroad".length);

  // The page where the founder approves access, which approves at once and sends them back.
  if (path === "/oauth/authorize") {
    const redirect = url.searchParams.get("redirect_uri");
    if (
      url.searchParams.get("client_id") !== GUMROAD.clientId ||
      url.searchParams.get("scope") !== "view_sales" ||
      url.searchParams.get("code_challenge_method") !== "S256" ||
      !redirect
    )
      return send(400, { error: "invalid_request" });
    const code = randomBytes(12).toString("hex");
    codes.set(code, { challenge: url.searchParams.get("code_challenge"), redirect });
    const back = new URL(redirect);
    back.searchParams.set("code", code);
    back.searchParams.set("state", url.searchParams.get("state") ?? "");
    response.writeHead(302, { location: back.toString() });
    response.end();
    return true;
  }
  if (path === "/oauth/token" && request.method === "POST") {
    const form = await readBody(request);
    const issued = codes.get(form.get("code") ?? "");
    codes.delete(form.get("code") ?? "");
    const verifier = form.get("code_verifier") ?? "";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    if (
      !issued ||
      form.get("grant_type") !== "authorization_code" ||
      form.get("client_id") !== GUMROAD.clientId ||
      !form.get("client_secret") ||
      form.get("redirect_uri") !== issued.redirect ||
      challenge !== issued.challenge
    )
      return send(400, { error: "invalid_grant" });
    return send(200, {
      access_token: GUMROAD.tokens.one,
      token_type: "Bearer",
      scope: "view_sales",
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  const token = (request.headers.authorization ?? "").replace(/^Bearer /, "");
  if (!Object.values(GUMROAD.tokens).includes(token))
    return send(401, { error: "invalid_token", error_description: "The access token is invalid" });
  if (path === "/oauth/token/info")
    return send(200, {
      resource_owner_id: 1,
      scope: token === GUMROAD.tokens.wide ? ["view_sales", "edit_products"] : ["view_sales"],
      expires_in: null,
      application: { uid: GUMROAD.clientId },
      created_at: Math.floor(Date.now() / 1000),
    });
  if (path === "/v2/user")
    return send(200, { success: true, user: { id: GUMROAD.user, name: "Harbor Seller" } });
  if (path === "/v2/products") return send(200, page(url, "products", products()));
  if (path === "/v2/products/prod_member/subscribers") {
    if (url.searchParams.get("paginated") !== "true")
      return send(400, { success: false, message: "Ask for pages." });
    return send(200, page(url, "subscribers", subscribers(), 100));
  }
  if (path === "/v2/products/prod_ebook/subscribers")
    return send(200, { success: true, subscribers: [] });
  if (path === "/v2/sales") {
    const product = url.searchParams.get("product_id");
    const after = Date.parse(`${url.searchParams.get("after") ?? "1970-01-01"}T00:00:00Z`);
    const listed = sales().filter(
      (sale) => (!product || sale.product_id === product) && Date.parse(sale.created_at) >= after,
    );
    return send(200, page(url, "sales", listed));
  }
  if (path === "/v2/sales/summary") {
    if (url.searchParams.get("group_by") !== "day")
      return send(400, { success: false, message: "Group by day." });
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const days = new Map();
    for (const sale of sales()) {
      const key = sale.created_at.slice(0, 10);
      if (key < from || key > to) continue;
      const day = days.get(key) ?? { gross_cents: 0, refunded_cents: 0, units: 0 };
      day.gross_cents += sale.price;
      day.refunded_cents += sale.refunded ? sale.price : 0;
      day.units += 1;
      days.set(key, day);
    }
    const breakdown = [...days]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, day]) => ({
        key,
        label: key,
        ...day,
        net_cents: day.gross_cents - day.refunded_cents,
        refunded_units: day.refunded_cents ? 1 : 0,
      }));
    return send(200, { success: true, currency: "usd", from, to, breakdown });
  }
  return send(404, { success: false, message: `Unknown path ${path}` });
}
