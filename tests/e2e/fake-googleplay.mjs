// A stand-in for Google's token endpoint and the Cloud Storage JSON API, for the tests only, under
// /googleplay as the app's GOOGLE_PLAY_API_BASE override expects: POST /googleplay/token and GET
// /googleplay/storage/v1/b/<bucket>/o/... Figures are placed relative to the current time, and EUR
// is 0.8 per USD.
//
// Service account "one" may view the financial reports in GOOGLE_PLAY.bucket, whose estimated
// sales reports (a zip a month, each with a CSV in UTF-16 with a byte order mark) hold two apps:
// com.harbor.fixture, which is verified, and com.harbor.other, whose $50 a month does not count.
// Subscriptions of com.harbor.fixture: $20 a month with $1.60 of tax, charged on the 1st for 14
// months; a new $20 one five days ago on the same monthly plan; EUR 100 a year with EUR 20 of tax,
// bought four months ago (counted as yearly, $10.42 a month); $30 a quarter, charged five and two
// months ago ($10 a month); $15 a month, charged four and three months ago and ended since; and $12
// refunded in full ten days ago. MRR is $60.42 from 4 subscribers, 1 of them counted as yearly.
// The history gives $20 at the month-end a year back, $40.42 thirty days ago and $60.42 now.
//
// For revenue, besides the subscriptions: a one-time product of $5 with $1 of tax ($5), a paid app
// of $3, and a one-time product of $10 with $4 refunded ($6). Service account "wide" is given a
// token that can do more than read Cloud Storage, and is refused.
import { createPrivateKey, createPublicKey, verify } from "node:crypto";
import { crc32, deflateRawSync } from "node:zlib";

const BUCKET = "pubsite_prod_rev_01234567890987654321";
const READ_ONLY = "https://www.googleapis.com/auth/devstorage.read_only";
const AUDIENCE = "https://oauth2.googleapis.com/token";

// Fixture keys, written as JSON Web Keys; they give access to nothing but this fake server.
const KEYS = {
  one: {
    kty: "RSA",
    n: "qossNOvZy9OlY3Ia4gx_PUxQQnne4CkWfRYWgkX3MS8YeIBh9BWJUdzha-MrCtntJifmMajMp6mTHCAzV1mXhsvieApt2BGpAkMEtO5m50Ns0rr7U3ufsW6iIE43loq-KbnsgpKDj0nppXzhusr3CF43V3UNa2Gqnq8kyLGtXJnjkzCFD6pnZaFQh4kHBmfgZV8B-zBsVn_j-6OVZ9TfZhb8S0lUQKQv8K1PYma-P_khoWl1N0Z1o44wL5gJIWovWRYgM9CddfDZTCi89t8d26z6TY47I1S-xN_ohIeeEbMxActKR4q-lrL_9uJRimvGyM6xeZ9RvnRgBW5Rllr-Bw",
    e: "AQAB",
    d: "LZsRA8fsUq7y4-CQItHvtr8xGU3I1Y33RxUAiO7X1y2-b_748tJNifg0yeqSSJEVc2YpDy-SJuXYgqVzxVCejjv4gFxdmnHCjenJGO9F0mM79zBsZBtDjanFrjjscZQBnVvsTNCMYOWFly0Jmi-Llw_G4drZ71TLUSsJ_adR8lh-wfhBvdhR5BW0sZN6MYvEeqIQ7Irn3PtmTXdu6qJrQM58EsxWREtbC2eizvZFKpIT28blgW3kKM9yLSE021sh2gIueD1z06NM5CqCX9vkY_nnVGbxlWY77NZhio5Yy9oAu4F_MN3vfbwDa8x2f3BZkYx5l6Wu6v3tVL3bLaodSQ",
    p: "3qsrqgXgbB7YvmkN57P8kGM1-J3yyuq5Z7Lps03ilhoIb0LJzB0dKssYIWkR6rlri4MzDfJaKmQpQdUhOQFssW-k_k1jRQ5cby7j5PD5v344K1PoYg6qYwzonuASW4e9exFDKQKQINKQd7_KLJQLEgE-kRjNehU3YFOQjfO74Ok",
    q: "xBKIg-s8qO_GFV5kg323O8k-CoCDNNi_yKzCusjsFlB6uDkKHDQgdvaF0SDsWmPDI0NXK7QI7ESjAULrO7bJ5za4pmdpHZRqOm3o7yfVBPhrskZTJiar7l4Pmm-tHs58SzB8hYdPDka7NIaHynUEkhL49B-nDoYD25GJoJ0tEW8",
    dp: "nPBJ-zDfJ3VqUHIc4dUiyuWSEaPJjyl2-dbJDp5zeFXq4fhR4LIYb6PrYwj6HtUHLrKPFmJdGIm15neATfxqDnlg8fe7Yt2nWpnS9_a8IDKnBirCm_I4N03O2sOVTLvUWdwl2M68pNWkCzK7HUZOsyb7YSr5D_XKLPNY7CQApJk",
    dq: "maeogjE0TXPyOMbLYFyB3wF7dEF4EU8XJM12oWhZ07boJTzWFnonQvM4tUXm04NA5n6cbqxdHcNANvnZXOeHXIH-vLFnp_2qLfX6SIlfn9CKnaANA2Xk8R2XfsCr2-uXblkmDIKYSqjVhnkzK07-8PabUL0JbxFJLqXkRBFIw1M",
    qi: "sGpJRaSiKsg6vbVuOxDZ9h8HhpRHlmSOJqCrgKBE6a50PGEe2G1aBaW0004a6RZkh6ZUm-0ESor984IzXJf8WH4tDyYDMlBEpmkNlL4kcVMg5U3jaUaFxyAHAH2GbeW6qeiNd5ZPaiO8JgfLshHf4oUK6TyCEqHCDEohfpI1mT4",
  },
  wide: {
    kty: "RSA",
    n: "y5N9EZDnTF2JravzQll3FwXAPM6IDeOfyQqLNJm9k3trg2vLo37_3t0SWtUKW83qNvIWixWv7m99a43vgXdmL03OzgW7_Zf63YOgttaQlwxBE4ptynxbh7Qx_t_vd2uMhXalEdV4P7XiOLRrGfPyWn4XG87_0O7mtc28cn77QiZk3qbqWsLhGSVwqC6XbMAoAjmKelk3hCoi39e_NGHC9FOV49mxkLz4321XFehX9PyttVZKeS35IkJg7NUoeMMdpYmJ4r_D439xdocJntAllJo6EZo7tPVTf0Tbh6VHZQvC179DaR6V8mBIoK82rasbEs59_MhYL4AEMtFBh5GDcQ",
    e: "AQAB",
    d: "DVFAbwf-7ZK36T3Uq8w8-2tTpFaxdVEk-IqhSSdejLmX8rC4UWGDPRHSu9DwfMl3bzE-ksowKGWwO3s9RgeozmLlarpazi_lSBzuhE98hXkWf8AARy0D8thxpdYB7RrCxk9Y5JYFqAtOuX1p_ThlbBCQE_BicUlTm-SR1Z6jcrQA6CQEp70n_l3uJNWgYEYFShG-ILT5YzMFrqH8mgf3n_qfdbw7cO04MxPSHOu_9DOd9BPGi7aLi1zUIgWquiw7IaT27CIeLado1DGRazvm2EFRk4Ldu8egQBsmVIL6_2e-viAq6Znp6G80wrRv3BjbfGeRvz-laqLMIR6ZXGi7EQ",
    p: "6fjJjLYNlzOyOTgQ1iMpboY9sh5u44NAwmaxyE-mTvXCwCJbu4qD87bYo0nszylASRnAm5-n63vBKkL1TglYf9UtNMVO0-UcUe1j0zuar4XwJHNPDQpKzzcVk58X-GVA7rXF4TCAz4aa0lvpFW925K56S_gTJRLMxqPPls4Lpyk",
    q: "3r4Z3b1wrkF4gBtDrKm3WnZaoEcR3eILw1jRsmcfwoTQMWg9tyNeFCxbP4IgiIuC8NwHshMnuRLvLF9GvKnY2zwuBZpL4e4j60vou5oMzrwtciMgVtvoLrNu7DYKHvPsy8A7J3LUtaLVd9OUA0P7qQnB7ARbHUVC-yn11IXG6wk",
    dp: "EiO4tJEUwqk-YxNGsuNs_eWoeNvFKxxs8-V0WRxbv3lsTOsdA5A8pLODXj2H_5OqKUC23xnksewZUMZ6MD-nPdnwNEwrzV_Q70UhXSoc1wjiUmEiOteWbzRNFvHZsOdgvmEXY1sYUX6VGEQJ8SCALkCcuLEWAuTPPYNLv9xfqOk",
    dq: "N9uueugOAPUUNfQgZYVuILZ7haQs-9q7HnMAq1-nHE3YM_uzNmEdL6vr-iI07GkoHiTfnS2mkYgJCLSf9aIWauxNkkQecXsZ8ODpbVp1icaxEuVyL7YYJNYEpCHtKdP79yCu9PacFyzNoa4ieSssSjjTM8_n1ZBP-tKL_o7J0pk",
    qi: "du9BbSWuXD7RPzlrLaEO8xmT-lN6J7dcZUPOqhSSaYCo3X8kJI8mqOuBAPzQA-H2tSKhOD3w9daUILCrz4gN9ex8BL9SqPxjD7SUMm7oeDTwCOxNIht_r0LpDY9Ez-F6O636cG5REBFhm9-Y1N1xq2Uj0SmFrzEw1928bgB9HmE",
  },
};

const accounts = Object.entries(KEYS).map(([name, jwk]) => {
  const privateKey = createPrivateKey({ key: jwk, format: "jwk" });
  return {
    name,
    email: `harbor-${name}@harbor-fixture.iam.gserviceaccount.com`,
    keyId: `${name === "one" ? "1a" : "2b"}${"0123456789abcdef".repeat(2)}cafe00`,
    privateKey,
    publicKey: createPublicKey(privateKey),
    token: `googleplay_token_harbor_${name}`,
    scope:
      name === "one" ? READ_ONLY : `${READ_ONLY} https://www.googleapis.com/auth/cloud-platform`,
  };
});

/** A service account's JSON key, as Google Cloud downloads it. */
function serviceAccountJson(account) {
  return JSON.stringify(
    {
      type: "service_account",
      project_id: "harbor-fixture",
      private_key_id: account.keyId,
      private_key: account.privateKey.export({ format: "pem", type: "pkcs8" }),
      client_email: account.email,
      client_id: "100000000000000000001",
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: AUDIENCE,
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(account.email)}`,
      universe_domain: "googleapis.com",
    },
    null,
    2,
  );
}

export const GOOGLE_PLAY = {
  bucket: BUCKET,
  /** As Play Console's Copy Cloud Storage URI gives it. */
  uri: `gs://${BUCKET}/sales`,
  packageName: "com.harbor.fixture",
  one: serviceAccountJson(accounts[0]),
  wide: serviceAccountJson(accounts[1]),
};

const HEADER = [
  "Order Number",
  "Order Charged Date",
  "Order Charged Timestamp",
  "Financial Status",
  "Device Model",
  "Product Title",
  "Package ID",
  "Product Type",
  "SKU ID",
  "Currency of Sale",
  "Item Price",
  "Taxes Collected",
  "Charged Amount",
  "City of Buyer",
  "State of Buyer",
  "Postcode of Buyer",
  "Country of Buyer",
  "Base Plan or Purchase Option ID",
  "Offer ID",
];

const DAY = 86_400_000;
const money = (value) => value.toFixed(2);

function sales() {
  const now = new Date();
  const [y, m] = [now.getUTCFullYear(), now.getUTCMonth()];
  const d = Math.min(now.getUTCDate(), 28);
  const ago = (days) => Date.now() - days * DAY;
  const row = (order, at, product, price, extra = {}) => {
    const {
      currency = "USD",
      tax = 0,
      status = "Charged",
      packageName = GOOGLE_PLAY.packageName,
    } = extra;
    return {
      at,
      cells: [
        order,
        new Date(at).toISOString().slice(0, 10),
        String(Math.floor(at / 1000)),
        status,
        "oriole",
        product.title,
        packageName,
        product.type,
        product.sku,
        currency,
        money(price),
        money(tax),
        money(price + tax),
        "",
        "",
        "",
        currency === "EUR" ? "DE" : "US",
        product.plan ?? "",
        "",
      ],
    };
  };
  const plan = (sku, basePlan) => ({
    title: "Harbor Premium",
    type: "Subscription",
    sku,
    plan: basePlan,
  });
  const monthly = plan("premium", "monthly");
  const coins = { title: "Coins", type: "One-time product", sku: "coins_100", plan: "coins" };
  const app = { title: "Harbor", type: "Paid app", sku: GOOGLE_PLAY.packageName };
  const renewal = (order, k) => (k === 0 ? order : `${order}..${k - 1}`);
  return [
    ...Array.from({ length: 14 }, (_, k) =>
      row(renewal("GPA.3301-0000-0000-00001", k), Date.UTC(y, m - 13 + k, 1), monthly, 20, {
        tax: 1.6,
      }),
    ),
    row("GPA.3301-0000-0000-00002", ago(5), monthly, 20),
    row("GPA.3301-0000-0000-00003", Date.UTC(y, m - 4, d), plan("premium", "yearly"), 100, {
      currency: "EUR",
      tax: 20,
    }),
    row("GPA.3301-0000-0000-00004", Date.UTC(y, m - 5, d), plan("premium", "quarterly"), 30),
    row("GPA.3301-0000-0000-00004..0", Date.UTC(y, m - 2, d), plan("premium", "quarterly"), 30),
    row("GPA.3301-0000-0000-00005", Date.UTC(y, m - 4, d), monthly, 15),
    row("GPA.3301-0000-0000-00005..0", Date.UTC(y, m - 3, d), monthly, 15),
    row("GPA.3301-0000-0000-00006", ago(10), monthly, 12),
    row("GPA.3301-0000-0000-00006", ago(9), monthly, -12, { status: "Refund" }),
    row("GPA.3301-0000-0000-00010", ago(6), coins, 5, { tax: 1 }),
    row("GPA.3301-0000-0000-00011", ago(7), app, 3),
    row("GPA.3301-0000-0000-00012", ago(12), coins, 10),
    row("GPA.3301-0000-0000-00012", ago(11), coins, -4, { status: "Partial refund" }),
    row("GPA.3302-0000-0000-00001", Date.UTC(y, m - 1, d), monthly, 50, {
      packageName: "com.harbor.other",
    }),
    row("GPA.3302-0000-0000-00001..0", Date.UTC(y, m, d), monthly, 50, {
      packageName: "com.harbor.other",
    }),
  ];
}

const csvCell = (value) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** A zip file with one deflated entry, as Play Console's reports come. */
function zip(name, content) {
  const data = deflateRawSync(content);
  const fileName = Buffer.from(name);
  const checksum = crc32(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(fileName.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(fileName.length, 28);
  const directoryAt = local.length + fileName.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + fileName.length, 12);
  end.writeUInt32LE(directoryAt, 16);
  return Buffer.concat([local, fileName, data, central, fileName, end]);
}

/** The monthly reports, by object name. */
function reports() {
  const months = new Map();
  for (const sale of sales()) {
    const date = new Date(sale.at);
    const month = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    months.set(month, [...(months.get(month) ?? []), sale]);
  }
  const files = new Map();
  for (const [month, rows] of months) {
    const text = [HEADER, ...rows.sort((a, b) => a.at - b.at).map((sale) => sale.cells)]
      .map((cells) => cells.map(csvCell).join(","))
      .join("\n");
    const content = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`${text}\n`, "utf16le")]);
    files.set(`sales/salesreport_${month}.zip`, zip(`salesreport_${month}.csv`, content));
  }
  return files;
}

async function readBody(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return new URLSearchParams(body);
}

/** The account whose key signed a valid assertion for a read-only token, or an OAuth error. */
function checkAssertion(assertion) {
  const [header, claims, signature] = (assertion ?? "").split(".");
  const decode = (part) => {
    try {
      return JSON.parse(Buffer.from(part ?? "", "base64url").toString("utf8"));
    } catch {
      return null;
    }
  };
  const head = decode(header);
  const set = decode(claims);
  if (head?.alg !== "RS256" || !set) return { error: "invalid_grant", description: "Invalid JWT." };
  const account = accounts.find((a) => a.email === set.iss);
  if (!account) return { error: "invalid_grant", description: "Invalid grant: account not found" };
  const signed = verify(
    "sha256",
    Buffer.from(`${header}.${claims}`),
    account.publicKey,
    Buffer.from(signature ?? "", "base64url"),
  );
  if (!signed || (head.kid && head.kid !== account.keyId))
    return { error: "invalid_grant", description: "Invalid JWT Signature." };
  const now = Math.floor(Date.now() / 1000);
  if (set.aud !== AUDIENCE || set.exp - set.iat > 3600 || set.exp < now || set.iat > now + 300)
    return {
      error: "invalid_grant",
      description: "Invalid JWT: Token must be a short-lived token.",
    };
  if (set.scope !== READ_ONLY) return { error: "invalid_scope", description: "Unexpected scope." };
  return { account };
}

export async function handleGooglePlay(url, request, response) {
  if (!url.pathname.startsWith("/googleplay/")) return false;
  const send = (status, body, type = "application/json") => {
    response.writeHead(status, { "content-type": type });
    response.end(type === "application/json" ? JSON.stringify(body) : body);
    return true;
  };
  const path = url.pathname.slice("/googleplay".length);

  // Issuing a token is the one request that is not a GET.
  if (path === "/token" && request.method === "POST") {
    const form = await readBody(request);
    if (form.get("grant_type") !== "urn:ietf:params:oauth:grant-type:jwt-bearer")
      return send(400, { error: "unsupported_grant_type" });
    const checked = checkAssertion(form.get("assertion"));
    if (!checked.account)
      return send(400, { error: checked.error, error_description: checked.description });
    return send(200, {
      access_token: checked.account.token,
      scope: checked.account.scope,
      token_type: "Bearer",
      expires_in: 3599,
    });
  }
  const failure = (code, message, reason) =>
    send(code, { error: { code, message, errors: [{ message, domain: "global", reason }] } });
  if (request.method !== "GET") return failure(405, "Method not allowed.", "methodNotAllowed");
  const account = accounts.find((a) => request.headers.authorization === `Bearer ${a.token}`);
  if (!account) return failure(401, "Invalid Credentials", "authError");
  const match = /^\/storage\/v1\/b\/([^/]+)\/o(?:\/(.+))?$/.exec(path);
  if (!match) return failure(404, "Not Found", "notFound");
  const bucket = decodeURIComponent(match[1]);
  if (bucket !== BUCKET) return failure(404, "The specified bucket does not exist.", "notFound");
  const files = reports();
  if (!match[2]) {
    const prefix = url.searchParams.get("prefix") ?? "";
    return send(200, {
      kind: "storage#objects",
      items: [...files]
        .filter(([name]) => name.startsWith(prefix))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, bytes]) => ({ name, size: String(bytes.length) })),
    });
  }
  const file = files.get(decodeURIComponent(match[2]));
  if (!file) return failure(404, "No such object.", "notFound");
  if (url.searchParams.get("alt") !== "media")
    return send(200, { name: decodeURIComponent(match[2]), size: String(file.length) });
  return send(200, file, "application/zip");
}
