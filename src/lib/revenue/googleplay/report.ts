// Play Console's estimated sales reports: one zip file a month in the reports bucket
// (`sales/salesreport_YYYYMM.zip`), holding a CSV with a row for every charge and every refund of
// the developer account's apps that month, refunds in the month they were made. Pure functions:
// a minimal zip reader (stored and deflated entries), text decoding, CSV parsing, and the rows.
import { crc32, inflateRawSync } from "node:zlib";
import { ProviderRequestError, tooMuchData } from "../http";
import { toMinorUnits } from "../money";

const NAME = "Google Play";

/** The largest CSV read from one report, so a huge account cannot exhaust the server's memory. */
export const MAX_CSV_BYTES = 128 * 1024 * 1024;

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;

function unreadable(): never {
  throw new ProviderRequestError("googleplay.reportUnreadable");
}

/** The end of the central directory, searched back over a comment of up to 64 KB. */
function endOfDirectory(zip: Buffer) {
  for (let at = zip.length - 22; at >= Math.max(0, zip.length - 22 - 0xffff); at--)
    if (zip.readUInt32LE(at) === END_OF_DIRECTORY) return at;
  return unreadable();
}

/**
 * The contents of a zip file's CSV entries, checked against their CRC-32. Zip64, encrypted and
 * other compression methods than stored and deflated are not expected in Play Console's reports.
 */
export function unzipCsv(zip: Buffer, maxBytes = MAX_CSV_BYTES, path = "") {
  if (zip.length < 22) unreadable();
  const end = endOfDirectory(zip);
  const count = zip.readUInt16LE(end + 10);
  const size = zip.readUInt32LE(end + 12);
  const offset = zip.readUInt32LE(end + 16);
  if (count === 0xffff || offset === 0xffffffff || offset + size > end) unreadable();
  const files: Buffer[] = [];
  let at = offset;
  for (let index = 0; index < count; index++) {
    if (at + 46 > end || zip.readUInt32LE(at) !== DIRECTORY_ENTRY) unreadable();
    const flags = zip.readUInt16LE(at + 8);
    const method = zip.readUInt16LE(at + 10);
    const checksum = zip.readUInt32LE(at + 16);
    const compressed = zip.readUInt32LE(at + 20);
    const length = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const skip = nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
    at += 46 + skip;
    if (!/\.csv$/i.test(name)) continue;
    if (flags & 1 || (method !== 0 && method !== 8)) unreadable();
    if (length > maxBytes) throw tooMuchData(NAME, path);
    if (local + 30 > zip.length || zip.readUInt32LE(local) !== LOCAL_HEADER) unreadable();
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    if (start + compressed > zip.length) unreadable();
    const data = zip.subarray(start, start + compressed);
    let content: Buffer;
    try {
      content = method === 0 ? data : inflateRawSync(data, { maxOutputLength: maxBytes });
    } catch {
      return unreadable();
    }
    if (content.length !== length || crc32(content) !== checksum) unreadable();
    files.push(content);
  }
  return files;
}

/**
 * Text in UTF-16 or UTF-8, by its byte order mark, or else by the zero bytes UTF-16 gives ASCII
 * text: Play Console writes some of its CSV files in UTF-16.
 */
export function decodeText(bytes: Buffer) {
  let encoding = "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
  else if (!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
    let even = 0;
    let odd = 0;
    const sample = Math.min(bytes.length, 2000);
    for (let i = 0; i < sample; i++) {
      if (bytes[i] !== 0) continue;
      if (i % 2) odd++;
      else even++;
    }
    if (odd > sample / 4) encoding = "utf-16le";
    else if (even > sample / 4) encoding = "utf-16be";
  }
  return new TextDecoder(encoding).decode(bytes);
}

/** Rows of a CSV file (RFC 4180): quoted fields may hold commas, quotes and line breaks. */
export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

/**
 * A row of the estimated sales report. Amounts are in minor units of the buyer's currency, as the
 * report gives them, so a refund's may be negative; null where they could not be read.
 */
export type SaleRow = {
  order: string;
  /** When the order was charged, or the refund made, in Unix seconds. */
  at: number;
  /** The financial status, lowercase: charged, refund, partial refund and so on. */
  status: string;
  packageName: string;
  /** Lowercase: subscription, one-time product (inapp) or paid app (paidapp). */
  productType: string;
  sku: string;
  basePlan: string;
  offer: string;
  currency: string | null;
  itemPrice: number | null;
  taxes: number | null;
  charged: number | null;
};

// The report's columns, by their names in lowercase; older reports call the package Product ID.
const COLUMNS = {
  order: ["order number"],
  timestamp: ["order charged timestamp"],
  date: ["order charged date"],
  status: ["financial status"],
  packageName: ["package id", "product id"],
  productType: ["product type"],
  sku: ["sku id"],
  currency: ["currency of sale"],
  itemPrice: ["item price"],
  taxes: ["taxes collected"],
  charged: ["charged amount"],
  basePlan: ["base plan or purchase option id", "base plan id"],
  offer: ["offer id"],
} as const;

/**
 * An amount in minor units from the report's major units, which may group thousands with commas
 * (12,345.67). Anything else, such as a decimal comma, is not read rather than misread.
 */
export function reportAmount(value: string | undefined, currency: string | null) {
  const text = value?.trim();
  if (!text || !currency) return null;
  if (!/^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(text)) return null;
  return toMinorUnits(text.replace(/,/g, ""), currency);
}

function rowTime(timestamp: string | undefined, date: string | undefined) {
  const number = Number(timestamp?.trim());
  if (timestamp?.trim() && Number.isFinite(number) && number > 0)
    return Math.floor(number > 1e11 ? number / 1000 : number);
  const day = date?.trim();
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) return Date.parse(`${day}T00:00:00Z`) / 1000;
  return null;
}

/**
 * The rows of a sales report's CSV for the given packages (compared without case). A report
 * without the columns verification needs is refused rather than misread.
 */
export function saleRows(text: string, packages: string[]): SaleRow[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  // Trimming also drops a byte order mark left in the first name.
  const names = header.map((name) => name.trim().toLowerCase());
  const column = (key: keyof typeof COLUMNS) => {
    for (const name of COLUMNS[key]) {
      const index = names.indexOf(name);
      if (index >= 0) return index;
    }
    return -1;
  };
  const index = Object.fromEntries(
    Object.keys(COLUMNS).map((key) => [key, column(key as keyof typeof COLUMNS)]),
  ) as Record<keyof typeof COLUMNS, number>;
  if (
    [index.order, index.status, index.packageName, index.productType, index.currency].some(
      (i) => i < 0,
    ) ||
    (index.timestamp < 0 && index.date < 0) ||
    (index.itemPrice < 0 && index.charged < 0)
  )
    throw new ProviderRequestError("googleplay.reportColumns");
  const wanted = new Set(packages.map((name) => name.toLowerCase()));
  const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
  const result: SaleRow[] = [];
  for (const row of rows) {
    const packageName = cell(row, index.packageName);
    if (!wanted.has(packageName.toLowerCase())) continue;
    const at = rowTime(cell(row, index.timestamp), cell(row, index.date));
    const order = cell(row, index.order);
    if (at === null || !order) continue;
    const code = cell(row, index.currency);
    const currency = /^[A-Za-z]{3}$/.test(code) ? code.toLowerCase() : null;
    result.push({
      order,
      at,
      status: cell(row, index.status).toLowerCase(),
      packageName: packageName.toLowerCase(),
      productType: cell(row, index.productType).toLowerCase(),
      sku: cell(row, index.sku),
      basePlan: cell(row, index.basePlan),
      offer: cell(row, index.offer),
      currency,
      itemPrice: reportAmount(cell(row, index.itemPrice), currency),
      taxes: reportAmount(cell(row, index.taxes), currency),
      charged: reportAmount(cell(row, index.charged), currency),
    });
  }
  return result;
}

/** A monthly report's object name, and the month (YYYYMM) it covers, or null for another file. */
export function reportMonth(name: string) {
  return /^sales\/salesreport_(\d{6})(?:_[^/]*)?\.zip$/.exec(name)?.[1] ?? null;
}

/** The month (YYYYMM, UTC) of a Unix time. */
export function monthOf(seconds: number) {
  const date = new Date(seconds * 1000);
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The Unix time a month (YYYYMM) starts. */
export function monthStart(month: string) {
  return Date.UTC(Number(month.slice(0, 4)), Number(month.slice(4)) - 1, 1) / 1000;
}

/** The month after a month (YYYYMM). */
export function nextMonth(month: string) {
  return monthOf(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(4)), 1) / 1000);
}

/** The rows of several reports, each once: a correction file may repeat rows of another. */
export function uniqueRows(rows: SaleRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = [row.order, row.status, row.at, row.itemPrice, row.charged].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
