// A stand-in for Mercado Pago's OAuth page and API, for the tests only, under /mercadopago: the
// approval page at /authorization (MERCADOPAGO_OAUTH_BASE) and the API (MERCADOPAGO_API_BASE).
// Figures are placed relative to the current time; the exchange-rate fake needs BRL at 5 and CLP
// at 1,000 per USD for the figures below.
//
// Approving access returns a code for tokens that can only read (read offline_access), for PKCE
// with S256 only. The approval page takes a fake_grant parameter that Mercado Pago does not have:
// "wide" adds write, so the exchange is refused, and "expiring" issues an access token with ten
// days left, so the first read renews it; a renewal spends the refresh token and ends the old
// access token, and the new access token lasts 180 days.
//
// The seller's authorized subscriptions: BRL 50 a month (paid on the 1st for 14 months, of which
// the search lists the last 12) and BRL 25 a month for the same payer (paid on the 1st for 3
// months, naming its subscription in the metadata), BRL 600 a year (paid 100 days ago) and CLP
// 30,000 every 3 months (paid 130 and 40 days ago). MRR is BRL 125 and CLP 10,000, $35 from 3
// subscribers; one in a free trial is not counted, and one without an amount is skipped (1 not
// counted). A paused subscription is not counted, and a cancelled one of BRL 40 a month, paid four
// and three months ago, counts in the history only, looked up by its id. The history lacks the
// BRL 50 plan at its oldest month-end, whose payment is older than the search's twelve months.
//
// One-time payments: BRL 100 with BRL 10 of tax (BRL 90), BRL 80 with BRL 30 refunded (BRL 50) and
// BRL 60 with a BRL 10 coupon (BRL 50). Not counted: one refunded in full, a transfer between
// users, one in test mode, one the seller paid to someone else, a rejected one, and one older than
// twelve months. Revenue of all time (the last twelve months) is BRL 1,545 and CLP 60,000, $369:
// $331 from subscriptions and $38 one-time.
import { createHash, randomBytes } from "node:crypto";

export const MERCADOPAGO = {
  clientId: "4934588586838432",
  user: 7700112233,
};

const DAY = 86_400_000;
const YEAR = 365 * DAY;
const iso = (ms) => new Date(ms).toISOString().replace(/Z$/, "-00:00");
const monthStart = (back) => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1);
};

// Codes waiting for their exchange, and the tokens issued, by their value.
const codes = new Map();
const accessTokens = new Map();
const refreshTokens = new Map();

function preapprovals() {
  const now = Date.now();
  const preapproval = (id, status, payer, created, recurring) => ({
    id,
    version: 1,
    application_id: Number(MERCADOPAGO.clientId),
    collector_id: MERCADOPAGO.user,
    preapproval_plan_id: null,
    reason: "Harbor plan",
    external_reference: null,
    payer_id: payer,
    status,
    date_created: iso(created),
    last_modified: iso(created),
    next_payment_date: iso(now + 10 * DAY),
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      currency_id: "BRL",
      start_date: iso(created),
      end_date: null,
      free_trial: { frequency: null, frequency_type: null },
      ...recurring,
    },
    summarized: { semaphore: "green" },
  });
  return [
    preapproval("pre_monthly", "authorized", 9001, monthStart(13), { transaction_amount: 50 }),
    preapproval("pre_addon", "authorized", 9001, monthStart(2), { transaction_amount: "25.00" }),
    preapproval("pre_yearly", "authorized", 9002, now - 100 * DAY, {
      frequency: 12,
      transaction_amount: 600,
    }),
    preapproval("pre_quarterly", "authorized", 9003, now - 130 * DAY, {
      frequency: 3,
      currency_id: "CLP",
      transaction_amount: 30000,
    }),
    preapproval("pre_trial", "authorized", 9004, now - 5 * DAY, {
      transaction_amount: 20,
      free_trial: { frequency: 1, frequency_type: "months" },
    }),
    preapproval("pre_unpriced", "authorized", 9007, now - 50 * DAY, { transaction_amount: null }),
    preapproval("pre_paused", "paused", 9005, now - 200 * DAY, { transaction_amount: 30 }),
    preapproval("pre_ended", "cancelled", 9006, monthStart(4), { transaction_amount: 40 }),
  ];
}

function payments() {
  const now = Date.now();
  const payment = (id, approved, amount, extra = {}) => ({
    id,
    date_created: iso(approved),
    date_approved: iso(approved),
    date_last_updated: iso(approved),
    money_release_date: iso(approved + 14 * DAY),
    operation_type: "regular_payment",
    payment_method_id: "visa",
    payment_type_id: "credit_card",
    status: "approved",
    status_detail: "accredited",
    currency_id: "BRL",
    description: "Harbor",
    live_mode: true,
    collector_id: MERCADOPAGO.user,
    payer: { id: "9100", email: null, identification: null, type: null },
    metadata: {},
    transaction_amount: amount,
    transaction_amount_refunded: 0,
    coupon_amount: 0,
    taxes_amount: 0,
    installments: 1,
    ...extra,
  });
  const charge = (id, subscription, approved, amount, extra = {}) =>
    payment(id, approved, amount, {
      operation_type: "recurring_payment",
      point_of_interaction: {
        type: "SUBSCRIPTIONS",
        transaction_data: { subscription_id: subscription },
      },
      ...extra,
    });
  return [
    ...Array.from({ length: 14 }, (_, k) => charge(91000 + k, "pre_monthly", monthStart(k), 50)),
    ...[0, 1, 2].map((k) =>
      payment(92000 + k, monthStart(k), 25, {
        operation_type: "recurring_payment",
        metadata: { preapproval_id: "pre_addon" },
      }),
    ),
    charge(93000, "pre_yearly", now - 100 * DAY, 600),
    charge(94000, "pre_quarterly", now - 130 * DAY, 30000, { currency_id: "CLP" }),
    charge(94001, "pre_quarterly", now - 40 * DAY, 30000, { currency_id: "CLP" }),
    charge(95000, "pre_ended", monthStart(4), 40),
    charge(95001, "pre_ended", monthStart(3), 40),
    charge(95002, "pre_monthly", now - 1 * DAY, 50, {
      status: "rejected",
      status_detail: "cc_rejected_insufficient_amount",
    }),
    payment(96000, now - 5 * DAY, 100, { taxes_amount: 10 }),
    payment(96001, now - 12 * DAY, 80, {
      transaction_amount_refunded: 30,
      status_detail: "partially_refunded",
    }),
    payment(96002, now - 20 * DAY, 60, { coupon_amount: 10 }),
    payment(96003, now - 8 * DAY, 70, {
      status: "refunded",
      status_detail: "refunded",
      transaction_amount_refunded: 70,
    }),
    payment(96004, now - 3 * DAY, 500, { operation_type: "money_transfer" }),
    payment(96005, now - 2 * DAY, 999, { live_mode: false }),
    payment(96006, now - 6 * DAY, 45, { collector_id: 123456 }),
    payment(96007, now - 400 * DAY, 1000),
  ];
}

function issue(grant) {
  const hex = () => randomBytes(8).toString("hex");
  const access = `APP_USR-${MERCADOPAGO.clientId}-102709-${hex()}-${MERCADOPAGO.user}`;
  const refresh = `TG-${hex()}-${MERCADOPAGO.user}`;
  const seconds = grant === "expiring" ? 10 * 86_400 : 15_552_000;
  accessTokens.set(access, { grant, expires: Date.now() + seconds * 1000 });
  refreshTokens.set(refresh, { grant, access });
  return {
    access_token: access,
    token_type: "bearer",
    expires_in: seconds,
    scope: grant === "wide" ? "offline_access read write" : "offline_access read",
    user_id: MERCADOPAGO.user,
    refresh_token: refresh,
    public_key: `APP_USR-${hex()}`,
    live_mode: true,
  };
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/;

function paymentSearch(url, send) {
  const query = url.searchParams;
  const invalid = (code, description) =>
    send(400, {
      message: description,
      error: "bad_request",
      status: 400,
      cause: [{ code, description }],
    });
  if (query.get("sort") !== "date_approved" || query.get("range") !== "date_approved")
    return invalid(1003, "Invalid sort value.");
  if (!["asc", "desc"].includes(query.get("criteria") ?? ""))
    return invalid(1004, "Invalid criteria value.");
  const begin = query.get("begin_date") ?? "";
  const end = query.get("end_date") ?? "";
  if (!TIME.test(begin) || !TIME.test(end))
    return invalid(1001, "Date format must be yyyy-MM-dd'T'HH:mm:ss.SSSZ.");
  const from = Date.parse(begin);
  const to = Date.parse(end);
  if (to < from || to - from >= YEAR)
    return invalid(9062, "Invalid range interval - Must be less than 365 days.");
  const limit = Number(query.get("limit") ?? 30);
  const offset = Number(query.get("offset") ?? 0);
  if (limit > 50 || offset > 10_000) return invalid(1000, "Number of rows exceeded the limits.");
  const status = query.get("status");
  const collector = query.get("collector.id");
  // The search lists the last twelve months only.
  const oldest = Date.now() - YEAR;
  const listed = payments()
    .filter((payment) => {
      const approved = Date.parse(payment.date_approved);
      return (
        approved >= Math.max(from, oldest) &&
        approved <= to &&
        (!status || payment.status === status) &&
        (!collector || String(payment.collector_id) === collector)
      );
    })
    .sort((a, b) => Date.parse(b.date_approved) - Date.parse(a.date_approved));
  if (query.get("criteria") === "asc") listed.reverse();
  return send(200, {
    paging: { total: listed.length, limit, offset },
    results: listed.slice(offset, offset + limit),
  });
}

export async function handleMercadoPago(url, request, response) {
  if (!url.pathname.startsWith("/mercadopago/")) return false;
  const send = (status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
    return true;
  };
  const path = url.pathname.slice("/mercadopago".length);

  // The page where the founder approves access, which approves at once and sends them back.
  if (path === "/authorization") {
    const query = url.searchParams;
    const redirect = query.get("redirect_uri");
    const grant = query.get("fake_grant") ?? "read";
    if (
      query.get("client_id") !== MERCADOPAGO.clientId ||
      query.get("response_type") !== "code" ||
      query.get("platform_id") !== "mp" ||
      query.get("code_challenge_method") !== "S256" ||
      !query.get("code_challenge") ||
      !query.get("state") ||
      !redirect ||
      !["read", "wide", "expiring"].includes(grant)
    )
      return send(400, { error: "invalid_request" });
    const code = `TG-${randomBytes(12).toString("hex")}-${MERCADOPAGO.user}`;
    codes.set(code, { challenge: query.get("code_challenge"), redirect, grant });
    const back = new URL(redirect);
    back.searchParams.set("code", code);
    back.searchParams.set("state", query.get("state"));
    response.writeHead(302, { location: back.toString() });
    response.end();
    return true;
  }

  // Issuing and renewing tokens are the only requests that are not GETs.
  if (path === "/oauth/token" && request.method === "POST") {
    if (!(request.headers["content-type"] ?? "").startsWith("application/json"))
      return send(400, { error: "invalid_request", message: "Send the parameters as JSON." });
    const body = await readJson(request);
    if (body?.client_id !== MERCADOPAGO.clientId || !body?.client_secret)
      return send(400, { error: "invalid_client", message: "invalid client_id or client_secret" });
    if (body.grant_type === "authorization_code") {
      const issued = codes.get(body.code);
      codes.delete(body.code);
      const challenge = createHash("sha256")
        .update(String(body.code_verifier ?? ""))
        .digest("base64url");
      if (!issued || body.redirect_uri !== issued.redirect || challenge !== issued.challenge)
        return send(400, { error: "invalid_grant", message: "invalid authorization code" });
      return send(200, issue(issued.grant));
    }
    if (body.grant_type === "refresh_token") {
      const held = refreshTokens.get(body.refresh_token);
      if (!held) return send(400, { error: "invalid_grant", message: "invalid refresh token" });
      refreshTokens.delete(body.refresh_token);
      accessTokens.delete(held.access);
      return send(200, issue(held.grant === "expiring" ? "read" : held.grant));
    }
    return send(400, { error: "unsupported_grant_type" });
  }
  if (request.method !== "GET") return send(405, { message: "Method not allowed", status: 405 });
  const token = (request.headers.authorization ?? "").replace(/^Bearer /, "");
  const held = accessTokens.get(token);
  if (!held || held.expires <= Date.now())
    return send(401, { message: "invalid access token", error: "unauthorized", status: 401 });

  if (path === "/users/me")
    return send(200, {
      id: MERCADOPAGO.user,
      nickname: "HARBORSELLER",
      site_id: "MLB",
      country_id: "BR",
      tags: ["normal"],
    });
  if (path === "/preapproval/search") {
    const status = url.searchParams.get("status");
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    if (limit > 100) return send(400, { message: "limit is too large", status: 400 });
    const listed = preapprovals().filter((preapproval) => !status || preapproval.status === status);
    return send(200, {
      paging: { offset, limit, total: listed.length },
      results: listed.slice(offset, offset + limit),
    });
  }
  if (path.startsWith("/preapproval/")) {
    const id = decodeURIComponent(path.slice("/preapproval/".length));
    const found = preapprovals().find((preapproval) => preapproval.id === id);
    return found
      ? send(200, found)
      : send(404, { message: "The preapproval does not exist", status: 404 });
  }
  if (path === "/v1/payments/search") return paymentSearch(url, send);
  return send(404, { message: `Unknown path ${path}`, status: 404 });
}
