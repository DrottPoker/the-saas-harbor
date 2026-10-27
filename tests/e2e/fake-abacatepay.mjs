// A stand-in for AbacatePay's Public MRR routes, for the tests only, under /abacatepay, as the
// override expects. Figures are placed relative to the current time, in centavos of BRL; at 5 BRL
// per USD, R$ 5 is $1.
//
// The Trust MRR token "one" belongs to a store created 600 days ago. Its MRR is R$ 500 ($100) from
// 4 active subscriptions, as AbacatePay counts them (trials included). Its daily MRR is R$ 250
// ($50) until the first day of the month six months back and R$ 500 ($100) since, so the
// month-end history is $50 for six months and $100 for the last six, and $100 thirty days ago.
// Revenue: R$ 500 ten days ago and every 30 days before that, sixteen times, and R$ 120 three days
// ago: R$ 620 ($124) in the last 30 days, R$ 6,120 ($1,224) in the last 12 months and R$ 8,120
// ($1,624) of all time. The API key "wide" reaches the whole account and is refused before any
// request; this server rejects it like any token other than "one".

export const ABACATEPAY = {
  one: "mrr_harborfixture0001AbCdEf",
  wide: "abc_dev_harborfixture0001AbCdEf",
};

const DAY = 86_400_000;
const STORE_AGE_DAYS = 600;
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Today, as the start of the UTC day. */
function today() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** The daily MRR in centavos: R$ 250 before the first day of the month six months back. */
function mrrOn(ms) {
  const now = new Date();
  const step = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1);
  return ms < step ? 25_000 : 50_000;
}

/** Revenue by day, in centavos. */
function revenueDays() {
  const days = new Map([[day(today() - 3 * DAY), { amount: 12_000, count: 1 }]]);
  for (let k = 0; k < 16; k++)
    days.set(day(today() - (10 + 30 * k) * DAY), { amount: 50_000, count: 2 });
  return days;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function handleAbacatePay(url, request, response) {
  if (!url.pathname.startsWith("/abacatepay/")) return false;
  const send = (status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
    return true;
  };
  const ok = (data) => send(200, { data, success: true, error: null });
  const invalid = (error) => send(400, { data: null, success: false, error });
  if (request.method !== "GET") return send(405, { data: null, success: false, error: "Method" });
  if (request.headers.authorization !== `Bearer ${ABACATEPAY.one}`)
    return send(401, { data: null, success: false, error: "Unauthorized" });
  const path = url.pathname.slice("/abacatepay".length);
  const created = today() - STORE_AGE_DAYS * DAY;

  if (path === "/v2/public-mrr/merchant-info")
    return ok({
      id: "store_harborfixture",
      name: "Harbor Fixture",
      website: "https://example.com",
      createdAt: new Date(created + 13 * 3_600_000).toISOString(),
      country: "BR",
    });
  if (path === "/v2/public-mrr/mrr")
    return ok({
      mrr: { currency: "BRL", value: 50_000 },
      totalActiveSubscriptions: { currency: "BRL", value: 4 },
    });

  const start = url.searchParams.get("startDate") ?? "";
  const end = url.searchParams.get("endDate") ?? "";
  if (!DATE.test(start) || !DATE.test(end)) return invalid("Invalid date");
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);

  if (path === "/v2/public-mrr/mrr-by-day") {
    if (to < from) return invalid("End date must not be before start date");
    if ((to - from) / DAY > 366) return invalid("Date range must be at most 366 days");
    const data = {};
    for (let at = Math.max(from, created); at <= Math.min(to, today()); at += DAY)
      data[day(at)] = { mrr: mrrOn(at) };
    return ok(data);
  }
  if (path === "/v2/public-mrr/revenue") {
    if (to <= from) return invalid("End date must be after start date");
    const transactionsPerDay = {};
    let totalRevenue = 0;
    let totalTransactions = 0;
    for (const [key, entry] of revenueDays()) {
      if (key < start || key > end) continue;
      transactionsPerDay[key] = entry;
      totalRevenue += entry.amount;
      totalTransactions += entry.count;
    }
    return ok({ totalRevenue, totalTransactions, transactionsPerDay });
  }
  return send(404, { data: null, success: false, error: `Unknown path ${path}` });
}
