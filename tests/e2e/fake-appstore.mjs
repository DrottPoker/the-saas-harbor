// A stand-in for the App Store Connect API, for the tests only, under /appstore, as the app's
// override expects. It checks each token's ES256 signature, lifetime and scope, which must name
// the request. Figures are placed relative to the current time, and EUR is 0.8 per USD. Reports
// exist for the days up to yesterday (UTC) within the year Apple keeps them.
//
// Key "one" is a Team key with the Sales role and access to reports: it cannot read certificates
// or reviews. Its team's daily subscription reports count, every day, Pro Monthly at $10.00 a
// month with 10 active subscriptions (3 more in a free trial, and 2 on a pay-as-you-go
// introductory offer, which are skipped), and 1 more on a paid win-back offer (skipped); Pro
// Yearly at $120.00 a year with 3 active ($30 a month) for the last 150 days; Pro Monthly at
// EUR 8.00 with 5 active (EUR 40, $50) for the last 20 days; and 4 subscriptions of a free tier
// in a second app, at no price. MRR is $180 from 18 subscriptions, 3 skipped, claiming the vendor
// and the first app. The history gives $100 at month-ends more than 150 days back, $130 at those
// within 150 days, $180 at one within 20 days, $130 thirty days ago and $180 now.
//
// Its daily sales reports: 3 days ago, 4 Pro Monthly renewals at $10.00 ($40, subscriptions), 2
// in-app purchases at $4.99 ($9.98, one-time), 50 free downloads and 20 updates (nothing); 10
// days ago, 5 Pro Monthly at EUR 8.00 (EUR 40, $50), and 3 in-app purchases at $4.99 with 1 of
// them refunded ($9.98); 40 days ago, 10 paid downloads at $2.99 ($29.90), and a Pro Monthly
// purchase refunded the same day ($0); 200 days ago, a Mac Pro Yearly at $120.00. Revenue is
// $109.96 for the last 30 days and $259.86 for the last 12 months and all time: $210.00 from
// subscriptions and $49.86 from one-time purchases.
//
// Key "wide" is an Admin key of the same team, which reads certificates, and is refused. Key
// "none" belongs to a team without subscriptions, whose subscription reports Apple refuses with
// the vendor number, as it does for a wrong one; its sales reports show the number is right, and
// its MRR is $0.
import { createECDH, createHash, createPrivateKey, createPublicKey, verify } from "node:crypto";
import { gzipSync } from "node:zlib";

// Keys are derived from fixed seeds, so the private keys need not be written down here.
function fixtureKey(seed) {
  const d = createHash("sha256").update(seed).digest();
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(d);
  const point = ecdh.getPublicKey();
  const b64 = (bytes) => bytes.toString("base64url");
  return createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: b64(d),
      x: b64(point.subarray(1, 33)),
      y: b64(point.subarray(33)),
    },
    format: "jwk",
  });
}

const ISSUER = "6a0f5c3e-0b7d-4c1e-9a52-1d2e3f4a5b6c";
const keys = {
  one: { issuer: ISSUER, keyId: "HARBOR0001", vendor: "85000001", role: "SALES" },
  wide: { issuer: ISSUER, keyId: "HARBOR0002", vendor: "85000001", role: "ADMIN" },
  none: {
    issuer: "0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
    keyId: "HARBOR0003",
    vendor: "85000003",
    role: "SALES",
  },
};
const privateKeys = Object.fromEntries(
  Object.keys(keys).map((name) => [name, fixtureKey(`harbor-appstore-${name}`)]),
);

/** What a founder pastes for each key; the private key as the .p8 file holds it. */
export const APPSTORE = Object.fromEntries(
  Object.entries(keys).map(([name, { issuer, keyId, vendor }]) => [
    name,
    {
      issuer,
      keyId,
      vendor,
      privateKey: privateKeys[name].export({ format: "pem", type: "pkcs8" }).toString(),
    },
  ]),
);

const DAY = 86_400_000;
const today = () => Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
const ageOf = (date) => Math.round((today() - Date.parse(`${date}T00:00:00Z`)) / DAY);

const SUBSCRIPTION_HEADER = [
  "App Name",
  "App Apple ID",
  "Subscription Name",
  "Subscription Apple ID",
  "Subscription Group ID",
  "Standard Subscription Duration",
  "Subscription Offer Name",
  "Promotional Offer ID",
  "Customer Price",
  "Customer Currency",
  "Developer Proceeds",
  "Proceeds Currency",
  "Preserved Pricing",
  "Proceeds Reason",
  "Client",
  "Device",
  "State",
  "Country",
  "Active Standard Price Subscriptions",
  "Active Free Trial Introductory Offer Subscriptions",
  "Active Pay Up Front Introductory Offer Subscriptions",
  "Active Pay As You Go Introductory Offer Subscriptions",
  "Free Trial Promotional Offer Subscriptions",
  "Pay Up Front Promotional Offer Subscriptions",
  "Pay As You Go Promotional Offer Subscriptions",
  "Free Trial Offer Code Subscriptions",
  "Pay Up Front Offer Code Subscriptions",
  "Pay As You Go Offer Code Subscriptions",
  "Marketing Opt-Ins",
  "Billing Retry",
  "Grace Period",
  "Subscribers",
  "Free Trial Win-Back Offers",
  "Pay Up Front Win-Back Offers",
  "Pay As You Go Win-Back Offers",
];

const SALES_HEADER = [
  "Provider",
  "Provider Country",
  "SKU",
  "Developer",
  "Title",
  "Version",
  "Product Type Identifier",
  "Units",
  "Developer Proceeds",
  "Begin Date",
  "End Date",
  "Customer Currency",
  "Country Code",
  "Currency of Proceeds",
  "Apple Identifier",
  "Customer Price",
  "Promo Code",
  "Parent Identifier",
  "Subscription",
  "Period",
  "Category",
  "CMB",
  "Supported Platforms",
  "Device",
  "Preserved Pricing",
  "Proceeds Reason",
  "Client",
  "Order Type",
];

const subscription = (fields) => ({
  "App Name": "Harbor Notes",
  "App Apple ID": "6400000001",
  "Subscription Group ID": "21000001",
  "Standard Subscription Duration": "1 Month",
  "Customer Currency": "USD",
  "Proceeds Currency": "USD",
  Device: "iPhone",
  Country: "US",
  ...fields,
});

function subscriptionRows(age) {
  const rows = [
    subscription({
      "Subscription Name": "Pro Monthly",
      "Subscription Apple ID": "6400000101",
      "Customer Price": "10.00",
      "Developer Proceeds": "7.00",
      "Active Standard Price Subscriptions": "10",
      "Active Free Trial Introductory Offer Subscriptions": "3",
      "Active Pay As You Go Introductory Offer Subscriptions": "2",
      Subscribers: "14",
    }),
    subscription({
      "Subscription Name": "Pro Monthly",
      "Subscription Apple ID": "6400000101",
      "Subscription Offer Name": "Come back",
      "Promotional Offer ID": "WINBACK1",
      "Customer Price": "10.00",
      "Developer Proceeds": "7.00",
      "Pay Up Front Win-Back Offers": "1",
    }),
    subscription({
      "App Name": "Harbor Free",
      "App Apple ID": "6400000002",
      "Subscription Name": "Free Tier",
      "Subscription Apple ID": "6400000201",
      "Customer Price": "0.00",
      "Developer Proceeds": "0.00",
      "Active Standard Price Subscriptions": "4",
    }),
  ];
  if (age <= 150)
    rows.push(
      subscription({
        "Subscription Name": "Pro Yearly",
        "Subscription Apple ID": "6400000102",
        "Standard Subscription Duration": "1 Year",
        "Customer Price": "120.00",
        "Developer Proceeds": "84.00",
        "Active Standard Price Subscriptions": "3",
      }),
    );
  if (age <= 20)
    rows.push(
      subscription({
        "Subscription Name": "Pro Monthly",
        "Subscription Apple ID": "6400000101",
        "Customer Price": "8.00",
        "Customer Currency": "EUR",
        "Developer Proceeds": "4.70",
        "Proceeds Currency": "EUR",
        Country: "DE",
        "Active Standard Price Subscriptions": "5",
      }),
    );
  return rows;
}

const sale = (type, title, appleId, units, price, currency = "USD", country = "US") => ({
  Provider: "APPLE",
  "Provider Country": "US",
  SKU: title.toLowerCase().replace(/\s+/g, "_"),
  Developer: "Harbor Fixture",
  Title: title,
  "Product Type Identifier": type,
  Units: String(units),
  "Developer Proceeds": (Math.abs(price) * 0.7).toFixed(2),
  "Customer Currency": currency,
  "Country Code": country,
  "Currency of Proceeds": currency,
  "Apple Identifier": appleId,
  "Customer Price": price.toFixed(2),
  "Parent Identifier": type.startsWith("IA") ? "harbor_notes" : "",
  Period: type.startsWith("IAY") ? "1 Month" : "",
});

function salesRows(age) {
  if (age === 3)
    return [
      sale("IAY", "Pro Monthly", "6400000101", 4, 10),
      sale("IA1", "Export Pack", "6400000301", 2, 4.99),
      sale("1F", "Harbor Free", "6400000002", 50, 0),
      sale("7F", "Harbor Free", "6400000002", 20, 0),
    ];
  if (age === 10)
    return [
      sale("IAY", "Pro Monthly", "6400000101", 5, 8, "EUR", "DE"),
      sale("IA1", "Export Pack", "6400000301", 3, 4.99),
      sale("IA1", "Export Pack", "6400000301", -1, -4.99),
    ];
  if (age === 40)
    return [
      sale("1F", "Harbor Classic", "6400000003", 10, 2.99),
      sale("IAY", "Pro Monthly", "6400000101", 1, 10),
      sale("IAY", "Pro Monthly", "6400000101", -1, -10),
    ];
  if (age === 200)
    return [{ ...sale("IAY-M", "Pro Yearly", "6400000102", 1, 120), Period: "1 Year" }];
  return [];
}

const tsv = (header, rows) =>
  gzipSync(
    [header, ...rows.map((row) => header.map((name) => row[name] ?? ""))]
      .map((cells) => cells.join("\t"))
      .join("\n") + "\n",
  );

const appleError = (status, code, title, detail, parameter) => ({
  errors: [
    {
      id: "harbor-fixture-error",
      status: String(status),
      code,
      title,
      detail,
      ...(parameter ? { source: { parameter } } : {}),
    },
  ],
});

const decode = (part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
const UNSCOPED = new Set(["limit", "cursor", "sort"]);
const paramsOf = (params) =>
  [...params]
    .filter(([name]) => !UNSCOPED.has(name))
    .map(([name, value]) => `${name}=${value}`)
    .sort()
    .join("&");

/** The key a token was signed with, when its signature, claims and scope hold. */
function authorize(authorization, path, url) {
  const [header, payload, signature] = authorization.replace(/^Bearer /, "").split(".");
  if (!signature) return null;
  let head, claims;
  try {
    head = decode(header);
    claims = decode(payload);
  } catch {
    return null;
  }
  const name = Object.keys(keys).find((key) => keys[key].keyId === head.kid);
  if (!name || head.alg !== "ES256" || head.typ !== "JWT") return null;
  const valid = verify(
    "sha256",
    Buffer.from(`${header}.${payload}`),
    { key: createPublicKey(privateKeys[name]), dsaEncoding: "ieee-p1363" },
    Buffer.from(signature, "base64url"),
  );
  const now = Date.now() / 1000;
  if (
    !valid ||
    claims.iss !== keys[name].issuer ||
    claims.aud !== "appstoreconnect-v1" ||
    !(claims.exp > now) ||
    !(claims.iat <= now + 60) ||
    claims.exp - claims.iat > 1200
  )
    return null;
  // Apple accepts tokens without a scope; the adapter scopes every one, so this fake requires it.
  const wanted = paramsOf(url.searchParams);
  const scoped =
    Array.isArray(claims.scope) &&
    claims.scope.some((entry) => {
      const [method, target = ""] = String(entry).split(" ");
      const [scopePath, query = ""] = target.split("?");
      return (
        method === "GET" && scopePath === path && paramsOf(new URLSearchParams(query)) === wanted
      );
    });
  return scoped ? name : null;
}

function salesReport(url, name, send, sendReport) {
  const filter = (key) => url.searchParams.get(`filter[${key}]`);
  const report = filter("reportType");
  const version = { SALES: "1_0", SUBSCRIPTION: "1_3" }[report];
  if (
    filter("frequency") !== "DAILY" ||
    filter("reportSubType") !== "SUMMARY" ||
    !version ||
    filter("version") !== version
  )
    return send(
      400,
      appleError(
        400,
        "PARAMETER_ERROR.INVALID",
        "A parameter has an invalid value",
        "Invalid report.",
      ),
    );
  const date = filter("reportDate") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return send(
      400,
      appleError(
        400,
        "PARAMETER_ERROR.INVALID",
        "A parameter has an invalid value",
        "Invalid date format.",
        "filter[reportDate]",
      ),
    );
  const unknownVendor = () =>
    send(
      400,
      appleError(
        400,
        "PARAMETER_ERROR.INVALID",
        "A parameter has an invalid value",
        "Invalid vendor number specified. Try again.",
        "filter[vendorNumber]",
      ),
    );
  if (filter("vendorNumber") !== keys[name].vendor) return unknownVendor();
  if (report === "SUBSCRIPTION" && name === "none") return unknownVendor();
  const age = ageOf(date);
  const rows =
    age < 1 || age > 365
      ? []
      : report === "SUBSCRIPTION"
        ? subscriptionRows(age)
        : name === "none"
          ? age === 2
            ? [sale("1F", "Harbor Lite", "6400000901", 5, 0)]
            : []
          : salesRows(age);
  if (!rows.length)
    return send(
      404,
      appleError(
        404,
        "NOT_FOUND",
        "The specified resource does not exist",
        "There were no sales for the date specified.",
      ),
    );
  return sendReport(tsv(report === "SUBSCRIPTION" ? SUBSCRIPTION_HEADER : SALES_HEADER, rows));
}

export async function handleAppStore(url, request, response) {
  if (!url.pathname.startsWith("/appstore/")) return false;
  const send = (status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
    return true;
  };
  const sendReport = (bytes) => {
    response.writeHead(200, { "content-type": "application/a-gzip" });
    response.end(bytes);
    return true;
  };
  const path = url.pathname.slice("/appstore".length);
  if (request.method !== "GET")
    return send(
      405,
      appleError(405, "METHOD_NOT_ALLOWED", "The request method is not allowed", "GET only."),
    );
  const name = authorize(request.headers.authorization ?? "", path, url);
  if (!name)
    return send(
      401,
      appleError(
        401,
        "NOT_AUTHORIZED",
        "Authentication credentials are missing or invalid.",
        "Provide a properly configured and signed bearer token, and make sure that it has not expired.",
      ),
    );
  const forbidden = () =>
    send(
      403,
      appleError(
        403,
        "FORBIDDEN_ERROR",
        "This request is forbidden for security reasons",
        "The API key in use does not allow this request",
      ),
    );
  const admin = keys[name].role === "ADMIN";
  if (path === "/v1/salesReports") return salesReport(url, name, send, sendReport);
  if (path === "/v1/certificates") return admin ? send(200, { data: [], links: {} }) : forbidden();
  if (path === "/v1/apps")
    return send(200, {
      data: [
        {
          type: "apps",
          id: name === "none" ? "6400000901" : "6400000001",
          attributes: { name: "Harbor Notes", bundleId: "com.example.harbornotes" },
        },
      ],
      links: {},
    });
  if (/^\/v1\/apps\/\d+\/customerReviews$/.test(path))
    return admin ? send(200, { data: [], links: {} }) : forbidden();
  return send(
    404,
    appleError(404, "NOT_FOUND", "The specified resource does not exist", `Unknown path ${path}`),
  );
}
