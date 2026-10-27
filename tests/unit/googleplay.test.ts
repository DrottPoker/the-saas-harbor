import { createServer, type Server } from "node:http";
import { generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { crc32, deflateRawSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { splitAccountKey } from "../../src/lib/revenue/account-key";
import { encryptProviderKey } from "../../src/lib/revenue/crypto";
import { googleplay } from "../../src/lib/revenue/googleplay";
import { READ_ONLY_SCOPE, requireReadOnly } from "../../src/lib/revenue/googleplay/client";
import {
  keyFromPrimes,
  parseGooglePlayBucket,
  parseGooglePlayKey,
  parseGooglePlayPackages,
  signedAssertion,
  storedConnection,
} from "../../src/lib/revenue/googleplay/key";
import {
  GRACE,
  googlePlayMrr,
  googlePlayServiceLines,
  learnPeriods,
  mrrWindowStart,
  orderCycle,
  periodMonths,
  saleCharges,
  snapPeriod,
} from "../../src/lib/revenue/googleplay/mrr";
import { googlePlayPayments } from "../../src/lib/revenue/googleplay/payments";
import {
  decodeText,
  monthOf,
  nextMonth,
  parseCsv,
  reportAmount,
  reportMonth,
  saleRows,
  uniqueRows,
  unzipCsv,
  type SaleRow,
} from "../../src/lib/revenue/googleplay/report";
import { monthEnds, mrrAt } from "../../src/lib/revenue/history";
import { AVERAGE_MONTH_DAYS } from "../../src/lib/revenue/money";
import { dayOf, dayStart } from "../../src/lib/revenue/payments";
import { GOOGLE_PLAY, handleGooglePlay } from "../e2e/fake-googleplay.mjs";

const DAY = 86_400;
const at = (year: number, month: number, day = 1) => Date.UTC(year, month, day) / 1000;
const NOW = at(2026, 9, 24) + 12 * 3_600;

const rsa = (bits = 2048) => generateKeyPairSync("rsa", { modulusLength: bits }).privateKey;
const KEY = rsa();
const KEY_ID = "0123456789abcdef0123456789abcdef01234567";
const EMAIL = "harbor-reader@my-app-123.iam.gserviceaccount.com";

function serviceAccount(overrides: Record<string, unknown> = {}, key: KeyObject = KEY) {
  return JSON.stringify(
    {
      type: "service_account",
      project_id: "my-app-123",
      private_key_id: KEY_ID,
      private_key: key.export({ format: "pem", type: "pkcs8" }),
      client_email: EMAIL,
      client_id: "100000000000000000001",
      token_uri: "https://oauth2.googleapis.com/token",
      ...overrides,
    },
    null,
    2,
  );
}

const BUCKET = "pubsite_prod_rev_01234567890987654321";
// A password input drops line breaks; the JSON stays valid, since its key escapes them.
const pasted = (json: string) => json.replace(/\n/g, "");
const input = (key = serviceAccount(), packages = "com.example.app") => ({
  key: pasted(key),
  account: `gs://${BUCKET}/sales`,
  extra: [packages],
});

describe("Google Play connection fields", () => {
  it("take the bucket from a gs:// URI, a Cloud Console address or its name", () => {
    expect(parseGooglePlayBucket(` gs://${BUCKET}/sales/ `)).toBe(BUCKET);
    expect(
      parseGooglePlayBucket(
        `https://console.cloud.google.com/storage/browser/${BUCKET}/earnings?project=x`,
      ),
    ).toBe(BUCKET);
    expect(parseGooglePlayBucket("pubsite_prod_0123456789")).toBe("pubsite_prod_0123456789");
    expect(() => parseGooglePlayBucket("my-own-bucket")).toThrow(/gs:\/\/pubsite_prod_/);
    expect(() => parseGooglePlayBucket("")).toThrow(/Cloud Storage URI/);
  });

  it("take package names, or the ids of Play Store addresses", () => {
    expect(parseGooglePlayPackages(" com.example.app ")).toEqual(["com.example.app"]);
    expect(
      parseGooglePlayPackages(
        "https://play.google.com/store/apps/details?id=com.example.pro&hl=en, com.example.app com.example.app",
      ),
    ).toEqual(["com.example.pro", "com.example.app"]);
    expect(() => parseGooglePlayPackages("")).toThrow(/package name/);
    expect(() => parseGooglePlayPackages("example")).toThrow(/package name/);
    expect(() => parseGooglePlayPackages("com.1example.app")).toThrow(/package name/);
    expect(() => parseGooglePlayPackages("a.a b.b c.c d.d e.e f.f")).toThrow(/at most 5/);
  });
});

describe("Google Play service account keys", () => {
  it("keep the bucket, the packages and what signing needs, with a hint", () => {
    const parsed = parseGooglePlayKey(input(serviceAccount(), "com.example.app,com.example.pro"));
    expect(parsed.livemode).toBe(true);
    expect(parsed.hint).toBe("com.example.app +1 · …4567");
    expect(parsed.hint.length).toBeLessThanOrEqual(40);
    const { account, key } = splitAccountKey(parsed.key);
    expect(account).toBe(BUCKET);
    expect(splitAccountKey(key).account).toBe("com.example.app,com.example.pro");
    expect(parsed.key).not.toContain("PRIVATE KEY");
    const connection = storedConnection(parsed.key);
    expect(connection.bucket).toBe(BUCKET);
    expect(connection.packages).toEqual(["com.example.app", "com.example.pro"]);
    expect(connection.account.email).toBe(EMAIL);
    expect(connection.account.keyId).toBe(KEY_ID);
  });

  it("rebuild a key that signs exactly as the original", () => {
    const connection = storedConnection(parseGooglePlayKey(input()).key);
    const data = Buffer.from("harbor");
    expect(sign("sha256", data, connection.account.privateKey)).toEqual(sign("sha256", data, KEY));
    const jwk = KEY.export({ format: "jwk" });
    expect(keyFromPrimes({ e: jwk.e!, p: jwk.p!, q: jwk.q! }).export({ format: "jwk" }).n).toBe(
      jwk.n,
    );
  });

  it("fit the stored key's limit once encrypted, with the largest key and package names", () => {
    const packages = Array.from({ length: 5 }, (_, i) => `com.example${i}.${"a".repeat(60)}`);
    const parsed = parseGooglePlayKey(
      input(
        serviceAccount(
          { client_email: `${"a".repeat(30)}@${"b".repeat(30)}.iam.gserviceaccount.com` },
          rsa(4096),
        ),
        packages.join(","),
      ),
    );
    const secret = Buffer.alloc(32, 7).toString("base64");
    expect(encryptProviderKey(parsed.key, "saas-id", secret).length).toBeLessThanOrEqual(2048);
  });

  it("refuse keys that are not a service account's, or that have broad access", () => {
    const refused = (key: string) => () => parseGooglePlayKey(input(key));
    expect(refused("not json")).toThrow(/whole JSON key/);
    expect(refused(`rk_live_${"a".repeat(24)}`)).toThrow(/another payment provider/);
    expect(refused(`AIza${"a".repeat(35)}`)).toThrow(/Google API key/);
    expect(refused(KEY.export({ format: "pem", type: "pkcs8" }) as string)).toThrow(
      /only the private key/,
    );
    expect(refused(JSON.stringify({ type: "authorized_user", refresh_token: "x" }))).toThrow(
      /a person's Google credentials/,
    );
    expect(
      refused(serviceAccount({ client_email: "my-app-123@appspot.gserviceaccount.com" })),
    ).toThrow(/default service account/);
    expect(
      refused(serviceAccount({ client_email: "1234567-compute@developer.gserviceaccount.com" })),
    ).toThrow(/default service account/);
    expect(
      refused(
        serviceAccount({
          client_email: "firebase-adminsdk-ab12c@my-app-123.iam.gserviceaccount.com",
        }),
      ),
    ).toThrow(/default service account/);
    expect(refused(serviceAccount({ client_email: "someone@example.com" }))).toThrow(
      /does not name a service account/,
    );
    expect(refused(serviceAccount({ private_key: "-----BEGIN PRIVATE KEY-----\nAAAA" }))).toThrow(
      /could not be read/,
    );
    const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey;
    expect(refused(serviceAccount({}, ec))).toThrow(/RSA key/);
    expect(refused(serviceAccount({}, rsa(1024)))).toThrow(/RSA key/);
  });

  it("sign a short-lived JWT for the read-only scope", () => {
    const { account } = storedConnection(parseGooglePlayKey(input()).key);
    const audience = "https://oauth2.googleapis.com/token";
    const jwt = signedAssertion(account, READ_ONLY_SCOPE, audience, NOW);
    const [header, claims, signature] = jwt.split(".");
    const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());
    expect(decode(header!)).toEqual({ alg: "RS256", typ: "JWT", kid: KEY_ID });
    expect(decode(claims!)).toEqual({
      iss: EMAIL,
      scope: READ_ONLY_SCOPE,
      aud: audience,
      iat: NOW,
      exp: NOW + 3600,
    });
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${claims}`),
        KEY,
        Buffer.from(signature!, "base64url"),
      ),
    ).toBe(true);
  });
});

describe("Google Play token scopes", () => {
  it("accept reading Cloud Storage only", () => {
    expect(() => requireReadOnly(READ_ONLY_SCOPE)).not.toThrow();
    expect(() => requireReadOnly(undefined)).not.toThrow();
    expect(() =>
      requireReadOnly(`${READ_ONLY_SCOPE} https://www.googleapis.com/auth/cloud-platform`),
    ).toThrow(/more access than reading Cloud Storage/);
    expect(() => requireReadOnly("https://www.googleapis.com/auth/androidpublisher")).toThrow();
    expect(() => requireReadOnly("")).toThrow();
  });
});

type Entry = { name: string; content: Buffer; stored?: boolean; flags?: number; crc?: number };

/** A zip file as an archiver writes it, with a comment at the end. */
function zipOf(entries: Entry[], comment = "") {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const data = entry.stored ? entry.content : deflateRawSync(entry.content);
    const name = Buffer.from(entry.name);
    const checksum = entry.crc ?? crc32(entry.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(entry.flags ?? 0, 6);
    local.writeUInt16LE(entry.stored ? 0 : 8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(entry.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(4, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(entry.flags ?? 0, 8);
    central.writeUInt16LE(entry.stored ? 0 : 8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(entry.content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    const record = Buffer.concat([local, name, Buffer.alloc(4), data]);
    locals.push(record);
    centrals.push(Buffer.concat([central, name]));
    offset += record.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(Buffer.byteLength(comment), 20);
  return Buffer.concat([...locals, directory, end, Buffer.from(comment)]);
}

describe("Google Play report files", () => {
  const csv = Buffer.from("Order Number,Item Price\nGPA.1,4.99\n");

  it("unzip deflated and stored CSV entries, and skip other files", () => {
    const zip = zipOf(
      [
        { name: "readme.txt", content: Buffer.from("not a report") },
        { name: "salesreport_202610.csv", content: csv },
        { name: "more.CSV", content: csv, stored: true },
      ],
      "a comment",
    );
    expect(unzipCsv(zip)).toEqual([csv, csv]);
  });

  it("refuse damaged, encrypted and oversized entries", () => {
    expect(() => unzipCsv(Buffer.from("not a zip at all, not even close"))).toThrow(
      /could not be read/,
    );
    expect(() => unzipCsv(zipOf([{ name: "a.csv", content: csv, crc: 1 }]))).toThrow(
      /could not be read/,
    );
    expect(() => unzipCsv(zipOf([{ name: "a.csv", content: csv, flags: 1 }]))).toThrow(
      /could not be read/,
    );
    const big = zipOf([{ name: "a.csv", content: Buffer.alloc(5000, 65) }]);
    expect(() => unzipCsv(big, 4000)).toThrow(/too much data/);
  });

  it("decode UTF-16 and UTF-8, with or without a byte order mark", () => {
    const text = "Order Number,Item Price\nGPA.1,€4.99\n";
    const le = Buffer.from(text, "utf16le");
    const be = Buffer.from(le).swap16();
    expect(decodeText(Buffer.concat([Buffer.from([0xff, 0xfe]), le]))).toBe(text);
    expect(decodeText(Buffer.concat([Buffer.from([0xfe, 0xff]), be]))).toBe(text);
    expect(decodeText(le)).toBe(text);
    expect(decodeText(be)).toBe(text);
    expect(decodeText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]))).toBe(
      text,
    );
    expect(decodeText(Buffer.from(text))).toBe(text);
  });

  it("parse quoted fields, line breaks and blank lines", () => {
    expect(parseCsv('a,b,c\r\n"1,5","say ""hi""","two\nlines"\n\n4,,6')).toEqual([
      ["a", "b", "c"],
      ["1,5", 'say "hi"', "two\nlines"],
      ["4", "", "6"],
    ]);
  });

  it("read amounts in major units with grouped thousands, and no decimal commas", () => {
    expect(reportAmount("12,345.67", "usd")).toBe(1_234_567);
    expect(reportAmount("-4.99", "eur")).toBe(-499);
    expect(reportAmount("600", "jpy")).toBe(600);
    expect(reportAmount("1.250", "kwd")).toBe(1250);
    expect(reportAmount("4,99", "eur")).toBeNull();
    expect(reportAmount("", "usd")).toBeNull();
    expect(reportAmount("4.99", null)).toBeNull();
  });

  it("name monthly reports and months", () => {
    expect(reportMonth("sales/salesreport_202610.zip")).toBe("202610");
    expect(reportMonth("sales/salesreport_202610_2.zip")).toBe("202610");
    expect(reportMonth("earnings/earnings_202610.zip")).toBeNull();
    expect(monthOf(at(2026, 0, 31) + 23 * 3600)).toBe("202601");
    expect(nextMonth("202612")).toBe("202701");
  });
});

const HEADER =
  "Order Number,Order Charged Date,Order Charged Timestamp,Financial Status,Device Model,Product Title,Package ID,Product Type,SKU ID,Currency of Sale,Item Price,Taxes Collected,Charged Amount,City of Buyer,State of Buyer,Postcode of Buyer,Country of Buyer,Base Plan or Purchase Option ID,Offer ID,Group ID,First USD 1M Eligible,Promotion ID,Coupon Value,Discount Rate,Featured Products ID,Price Experiment ID,Sales Channel";

describe("Google Play sales rows", () => {
  const line = (cells: string[]) => cells.join(",");
  const report = [
    // A byte order mark before the first column's name.
    `${String.fromCharCode(0xfeff)}${HEADER}`,
    line([
      "GPA.3301-1111-2222-33333..2",
      "2026-10-01",
      String(at(2026, 9) + 60),
      "Charged",
      "oriole",
      '"Premium, monthly"',
      "com.Example.App",
      "Subscription",
      "premium",
      "EUR",
      '"1,000.00"',
      "190.00",
      '"1,190.00"',
      "",
      "",
      "",
      "DE",
      "monthly",
      "",
      ...Array(8).fill(""),
    ]),
    line([
      "GPA.3301-9999-0000-00000",
      "2026-10-02",
      "",
      "Charged",
      "oriole",
      "Coins",
      "com.other.app",
      "One-time product",
      "coins",
      "USD",
      "1.99",
      "",
      "1.99",
      ...Array(14).fill(""),
    ]),
    line([
      "GPA.3301-4444-5555-66666",
      "2026-10-03",
      "",
      "Refund",
      "oriole",
      "Coins",
      "com.example.app",
      "inapp",
      "coins",
      "USD",
      "-1.99",
      "",
      "-1.99",
      ...Array(14).fill(""),
    ]),
  ].join("\r\n");

  it("read the rows of the chosen apps, by timestamp or else by date", () => {
    expect(saleRows(report, ["com.example.app"])).toEqual([
      {
        order: "GPA.3301-1111-2222-33333..2",
        at: at(2026, 9) + 60,
        status: "charged",
        packageName: "com.example.app",
        productType: "subscription",
        sku: "premium",
        basePlan: "monthly",
        offer: "",
        currency: "eur",
        itemPrice: 100_000,
        taxes: 19_000,
        charged: 119_000,
      },
      {
        order: "GPA.3301-4444-5555-66666",
        at: at(2026, 9, 3),
        status: "refund",
        packageName: "com.example.app",
        productType: "inapp",
        sku: "coins",
        basePlan: "",
        offer: "",
        currency: "usd",
        itemPrice: -199,
        taxes: null,
        charged: -199,
      },
    ]);
  });

  it("read older reports, which call the package Product ID", () => {
    const older =
      "Order Number,Order Charged Date,Order Charged Timestamp,Financial Status,Device Model,Product Title,Product ID,Product Type,SKU ID,Currency of Sale,Item Price,Taxes Collected,Charged Amount\n" +
      `GPA.1,2020-01-01,${at(2020, 0)},Charged,x,Pro,com.example.app,subscription,pro,USD,4.99,0.00,4.99\n`;
    expect(saleRows(older, ["com.example.app"])).toMatchObject([
      { order: "GPA.1", packageName: "com.example.app", itemPrice: 499, basePlan: "" },
    ]);
  });

  it("refuse a report without the columns verification reads", () => {
    expect(() => saleRows("Order Number,Item Price\nGPA.1,4.99", ["com.example.app"])).toThrow(
      /columns/,
    );
    expect(saleRows("", ["com.example.app"])).toEqual([]);
  });
});

const row = (
  order: string,
  seconds: number,
  price: number | null,
  overrides: Partial<SaleRow> = {},
): SaleRow => ({
  order,
  at: seconds,
  status: "charged",
  packageName: "com.example.app",
  productType: "subscription",
  sku: "premium",
  basePlan: "monthly",
  offer: "",
  currency: "usd",
  itemPrice: price === null ? null : Math.round(price * 100),
  taxes: 0,
  charged: price === null ? null : Math.round(price * 100),
  ...overrides,
});

/** A chain's orders: the first, then its renewals `..0`, `..1` and so on. */
const chain = (id: string, times: number[], price: number, overrides: Partial<SaleRow> = {}) =>
  times.map((seconds, k) => row(k ? `${id}..${k - 1}` : id, seconds, price, overrides));

describe("Google Play order chains", () => {
  it("name the first order and each renewal", () => {
    expect(orderCycle("GPA.3301-1111-2222-33333")).toEqual({
      chain: "GPA.3301-1111-2222-33333",
      cycle: 0,
    });
    expect(orderCycle("GPA.3301-1111-2222-33333..0")).toEqual({
      chain: "GPA.3301-1111-2222-33333",
      cycle: 1,
    });
    expect(orderCycle("GPA.3301-1111-2222-33333..12").cycle).toBe(13);
  });

  it("snap the time between charges to Google Play's billing periods", () => {
    expect(snapPeriod(at(2026, 0), at(2026, 1))).toEqual({ unit: "month", count: 1 });
    expect(snapPeriod(at(2026, 0, 31), at(2026, 1, 28))).toEqual({ unit: "month", count: 1 });
    expect(snapPeriod(at(2026, 0, 1), at(2026, 0, 29))).toEqual({ unit: "week", count: 4 });
    // Four weeks from the 1st of February is also a month: the longer wins.
    expect(snapPeriod(at(2026, 1, 1), at(2026, 2, 1))).toEqual({ unit: "month", count: 1 });
    expect(snapPeriod(at(2026, 0, 1), at(2026, 0, 8))).toEqual({ unit: "week", count: 1 });
    expect(snapPeriod(at(2026, 0, 1), at(2026, 3, 3))).toEqual({ unit: "month", count: 3 });
    expect(snapPeriod(at(2026, 0, 1), at(2026, 8, 1))).toEqual({ unit: "month", count: 8 });
    expect(snapPeriod(at(2025, 9, 24), at(2026, 9, 24))).toEqual({ unit: "month", count: 12 });
    expect(snapPeriod(at(2026, 0, 1), at(2026, 0, 3))).toBeNull();
    expect(snapPeriod(at(2026, 0, 1), at(2026, 1, 15))).toBeNull();
    expect(snapPeriod(at(2026, 0, 1), at(2026, 4, 1))).toEqual({ unit: "month", count: 4 });
    expect(snapPeriod(at(2026, 0, 1), at(2026, 5, 1))).toBeNull();
  });

  it("value charges by item price without tax, less their refunds, each order once", () => {
    const rows = [
      row("A", at(2026, 9), 10, { taxes: 190, charged: 1190 }),
      row("A", at(2026, 9), 10, { taxes: 190, charged: 1190 }),
      row("B", at(2026, 9), null, { charged: 1190, taxes: 190 }),
      row("C", at(2026, 9), 10),
      row("C", at(2026, 9, 2), -4, { status: "partial refund" }),
      row("C", at(2026, 9, 3), -6, { status: "refund" }),
      row("D", at(2026, 9), 10),
      row("D", at(2026, 9, 2), 3, { status: "partial refund" }),
      row("E", at(2026, 9), 10),
      row("E", at(2026, 9, 2), null, { status: "refund" }),
      row("F", at(2026, 9), null),
      row("G", at(2026, 9), 0),
      row("H", at(2026, 9), 5, { status: "chargeback" }),
    ];
    const { charges, unreadable } = saleCharges(rows);
    expect(charges.map((c) => [c.order, c.amount, c.refunded])).toEqual([
      ["A", 1000, 0],
      ["B", 1000, 0],
      ["C", 1000, 1000],
      ["D", 1000, 300],
      ["E", 1000, 1000],
    ]);
    expect(unreadable).toEqual([{ order: "F", at: at(2026, 9) }]);
  });
});

describe("Google Play billing periods", () => {
  it("are learned per base plan, the most common gap first and the longer of a tie", () => {
    const { charges } = saleCharges([
      ...chain("M1", [at(2026, 6), at(2026, 7), at(2026, 8)], 10),
      // A pause makes one gap two months; the plan stays monthly.
      ...chain("M2", [at(2026, 4), at(2026, 6), at(2026, 7)], 10),
      ...chain("T1", [at(2026, 0), at(2026, 1)], 10, { basePlan: "tie" }),
      ...chain("T2", [at(2026, 0), at(2026, 3)], 10, { basePlan: "tie" }),
      ...chain("N1", [at(2026, 0)], 10, { basePlan: "new" }),
    ]);
    const periodOf = learnPeriods(charges);
    const find = (order: string) => charges.find((charge) => charge.order === order)!;
    expect(periodOf(find("M1"))).toEqual({ unit: "month", count: 1 });
    expect(periodOf(find("T1"))).toEqual({ unit: "month", count: 3 });
    expect(periodOf(find("N1"))).toBeNull();
  });

  it("of a first charge bought with an offer come from that offer", () => {
    const { charges } = saleCharges([
      // Three months for $5 as a single payment, then $10 a month.
      row("I1", at(2026, 0), 5, { offer: "intro" }),
      ...chain("I1", [at(2026, 0), at(2026, 3), at(2026, 4)], 10, { offer: "intro" }).slice(1),
      row("I2", at(2026, 9), 5, { offer: "intro" }),
      row("O1", at(2026, 9), 7, { offer: "other" }),
    ]);
    const periodOf = learnPeriods(charges);
    const find = (order: string) => charges.find((charge) => charge.order === order)!;
    expect(periodOf(find("I2"))).toEqual({ unit: "month", count: 3 });
    expect(periodOf(find("I1..1"))).toEqual({ unit: "month", count: 1 });
    expect(periodOf(find("O1"))).toBeNull();
  });
});

describe("Google Play MRR", () => {
  const rows = [
    ...chain("A", [at(2026, 7), at(2026, 8), at(2026, 9)], 20),
    // A new subscriber on the same plan is monthly too.
    row("B", at(2026, 9, 20), 20),
    // Yearly, which nothing shows yet.
    row("C", at(2026, 5, 10), 120, { basePlan: "yearly", currency: "eur" }),
    ...chain("D", [at(2026, 4, 10), at(2026, 7, 10)], 30, { basePlan: "quarterly" }),
    // Weekly.
    ...chain("W", [NOW - 15 * DAY, NOW - 8 * DAY, NOW - DAY], 2, { basePlan: "weekly" }),
    // Ended: its month and the week after are over.
    ...chain("E", [at(2026, 6, 10), at(2026, 7, 10)], 15),
    // Refunded in full.
    row("R", at(2026, 9, 10), 12),
    row("R", at(2026, 9, 11), -12, { status: "refund" }),
    // One-time purchases are not subscriptions.
    row("O", at(2026, 9, 10), 99, { productType: "one-time product", basePlan: "" }),
  ];

  it("values each subscription by its latest charge over its billing period", () => {
    const { charges } = saleCharges(rows);
    const mrr = googlePlayMrr(charges, NOW);
    expect(mrr.byCurrency.usd).toBeCloseTo(2000 + 2000 + 1000 + (200 * AVERAGE_MONTH_DAYS) / 7, 6);
    expect(mrr.byCurrency.eur).toBeCloseTo(1000, 6);
    expect(mrr.customers).toBe(5);
    expect(mrr.yearly).toBe(1);
    expect(mrr.note).toBe(
      "1 subscription counts as yearly until a renewal shows how often it renews.",
    );
  });

  it("counts a subscription until a week after its period", () => {
    const { charges } = saleCharges(chain("A", [at(2026, 7, 10), at(2026, 8, 10)], 20));
    expect(googlePlayMrr(charges, at(2026, 9, 10) + GRACE - 1).customers).toBe(1);
    expect(googlePlayMrr(charges, at(2026, 9, 10) + GRACE).customers).toBe(0);
  });

  it("reads back far enough for a yearly plan's latest two charges", () => {
    expect(mrrWindowStart(new Date(NOW * 1000))).toBe(at(2025, 8, 24));
  });

  it("gives service lines that meet, and match the MRR now", () => {
    const { charges } = saleCharges(rows);
    const lines = googlePlayServiceLines(charges);
    const a = lines.filter((line) => line.start >= at(2026, 7) && line.monthly === 2000);
    expect(a.slice(0, 2).map((line) => [line.start, line.end])).toEqual([
      [at(2026, 7), at(2026, 8)],
      [at(2026, 8), at(2026, 9)],
    ]);
    const now = mrrAt(lines, NOW);
    const mrr = googlePlayMrr(charges, NOW).byCurrency;
    expect(now.usd).toBeCloseTo(mrr.usd!, 6);
    expect(now.eur).toBeCloseTo(mrr.eur!, 6);
    // On 20 August: A, the second quarter of D, E before it ended, and C in euros.
    expect(mrrAt(lines, at(2026, 7, 20))).toEqual({ usd: 2000 + 1000 + 1500, eur: 1000 });
    expect(periodMonths({ unit: "week", count: 1 })).toBeCloseTo(7 / AVERAGE_MONTH_DAYS, 10);
  });
});

describe("Google Play revenue", () => {
  it("sums each day's charges per kind and currency, less refunds", () => {
    const { charges } = saleCharges([
      row("A", at(2026, 9, 1) + 3600, 20),
      row("B", at(2026, 9, 1) + 7200, 10),
      row("B", at(2026, 9, 3), -10, { status: "refund" }),
      row("C", at(2026, 9, 1) + 3600, 5, { productType: "one-time product" }),
      row("D", at(2026, 9, 1) + 3600, 3, { productType: "paid app", currency: "eur" }),
      row("E", at(2026, 9, 2), 10, { productType: "inapp" }),
      row("E", at(2026, 9, 3), -4, { status: "partial refund", productType: "inapp" }),
      row("F", at(2026, 8, 30), 50),
    ]);
    const payments = googlePlayPayments(charges, at(2026, 9), null);
    expect(payments).toEqual([
      {
        id: "2026-10-01:subscription:usd",
        at: at(2026, 9),
        fingerprint: "3000:1000:2",
        value: { currency: "usd", amount: 2000 },
        kind: "subscription",
      },
      {
        id: "2026-10-01:one_time:usd",
        at: at(2026, 9),
        fingerprint: "500:0:1",
        value: { currency: "usd", amount: 500 },
        kind: "one_time",
      },
      {
        id: "2026-10-01:one_time:eur",
        at: at(2026, 9),
        fingerprint: "300:0:1",
        value: { currency: "eur", amount: 300 },
        kind: "one_time",
      },
      {
        id: "2026-10-02:one_time:usd",
        at: at(2026, 9, 2),
        fingerprint: "1000:400:1",
        value: { currency: "usd", amount: 600 },
        kind: "one_time",
      },
    ]);
    expect(googlePlayPayments(charges, at(2026, 8), at(2026, 9)).map((p) => p.id)).toEqual([
      "2026-09-30:subscription:usd",
    ]);
  });

  it("keep a day refunded in full, at nothing, so its stored figure changes", () => {
    const { charges } = saleCharges([
      row("A", at(2026, 9, 1), 20),
      row("A", at(2026, 9, 2), -20, { status: "refund" }),
    ]);
    expect(googlePlayPayments(charges, at(2026, 9), null)).toMatchObject([
      { fingerprint: "2000:2000:1", value: { amount: 0 } },
    ]);
  });

  it("count repeated rows of two report files once", () => {
    const rows = [row("A", at(2026, 9), 20), row("A", at(2026, 9), 20)];
    expect(uniqueRows(rows)).toHaveLength(1);
  });
});

describe("Google Play through its API", () => {
  let server: Server;
  const previous = process.env.GOOGLE_PLAY_API_BASE;

  beforeAll(async () => {
    server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      void handleGooglePlay(url, request, response).then((handled) => {
        if (!handled) response.writeHead(404).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No port.");
    process.env.GOOGLE_PLAY_API_BASE = `http://127.0.0.1:${address.port}/googleplay`;
  });

  afterAll(() => {
    server.close();
    if (previous === undefined) delete process.env.GOOGLE_PLAY_API_BASE;
    else process.env.GOOGLE_PLAY_API_BASE = previous;
  });

  const connect = (json: string, bucket = GOOGLE_PLAY.uri) =>
    googleplay.parseKey(
      { key: pasted(json), account: bucket, extra: [GOOGLE_PLAY.packageName] },
      { allowTest: false },
    ).key;

  it("verifies MRR and the history of one app from the sales reports", async () => {
    const now = new Date();
    const reading = await googleplay.read(connect(GOOGLE_PLAY.one), true, {
      allowTest: false,
      now,
      history: true,
    });
    expect(reading.livemode).toBe(true);
    expect(reading.byCurrency.usd).toBeCloseTo(5000, 6);
    expect(reading.byCurrency.eur).toBeCloseTo(10_000 / 12, 6);
    expect(reading.customers).toBe(4);
    expect(reading.subscriptionIds).toEqual(["package:com.harbor.fixture"]);
    expect(reading.skippedItems).toBe(0);
    expect(reading.mrrNote).toMatch(/^1 subscription counts as yearly/);
    expect(reading.historyNote).toBeNull();
    const lines = reading.lines!;
    const seconds = Math.floor(now.getTime() / 1000);
    expect(mrrAt(lines, monthEnds(now)[0]!.at)).toEqual({ usd: 2000 });
    expect(mrrAt(lines, seconds - 30 * DAY).usd).toBeCloseTo(3000, 6);
    expect(mrrAt(lines, seconds).usd).toBeCloseTo(5000, 6);

    const hourly = await googleplay.read(connect(GOOGLE_PLAY.one), true, {
      allowTest: false,
      now,
      history: false,
    });
    expect(hourly.byCurrency).toEqual(reading.byCurrency);
    expect(hourly.lines).toBeNull();
  });

  it("refuses a token that can do more than read Cloud Storage", async () => {
    await expect(
      googleplay.read(connect(GOOGLE_PLAY.wide), true, {
        allowTest: false,
        now: new Date(),
        history: false,
      }),
    ).rejects.toThrow(/more access than reading Cloud Storage/);
  });

  it("explains a key Google does not know and a bucket it cannot find", async () => {
    const options = { allowTest: false, now: new Date(), history: false };
    await expect(googleplay.read(connect(serviceAccount()), true, options)).rejects.toThrow(
      /refused the service account's JSON key/,
    );
    await expect(
      googleplay.read(
        connect(GOOGLE_PLAY.one, "pubsite_prod_rev_99999999999999999999"),
        true,
        options,
      ),
    ).rejects.toThrow(/no reports bucket/);
  });

  it("lists each day's revenue, and stops at a whole month when out of pages", async () => {
    const now = Math.floor(Date.now() / 1000);
    const since = dayStart(dayOf(now - 40 * DAY));
    const read = await googleplay.payments(connect(GOOGLE_PLAY.one), true, {
      allowTest: false,
      since,
      before: null,
      maxPages: 200,
      stored: () => null,
    });
    expect(read.complete).toBe(true);
    const total = (kind: string) =>
      read.payments
        .filter((payment) => payment.kind === kind)
        .reduce((sum, payment) => sum + payment.value!.amount, 0);
    expect(total("one_time")).toBeCloseTo(500 + 300 + 600, 6);
    const date = new Date(now * 1000);
    const firsts = [0, 1]
      .map((back) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - back, 1) / 1000)
      .filter((first) => first >= since).length;
    expect(total("subscription")).toBeCloseTo(2000 + 2000 * firsts, 6);
    expect(read.payments.every((payment) => payment.at >= since)).toBe(true);

    const short = await googleplay.payments(connect(GOOGLE_PLAY.one), true, {
      allowTest: false,
      since: dayStart(dayOf(now - 70 * DAY)),
      before: null,
      maxPages: 1,
      stored: () => null,
    });
    expect(short.complete).toBe(false);
    expect(short.from).toBe(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000);
    expect(short.payments.every((payment) => payment.at >= short.from!)).toBe(true);
  });
});
