import "server-only";
import {
  apiBase,
  errorBody,
  MAX_PAGES,
  providerGet,
  ProviderRequestError,
  tooMuchData,
} from "../http";
import type { ChargebeeInvoice, ChargebeeSubscription } from "./mrr";

// Each Chargebee site has its own address; a test site's name ends in -test.
function base(site: string) {
  const override = process.env.CHARGEBEE_API_BASE;
  if (override) return `${apiBase(override, "", "Chargebee")}/${site}`;
  return `https://${site}.chargebee.com/api/v2`;
}

async function chargebeeGet<T>(site: string, key: string, path: string, params: URLSearchParams) {
  const url = new URL(`${base(site)}${path}`);
  url.search = params.toString();
  const response = await providerGet("chargebee", "Chargebee", url, {
    Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
    Accept: "application/json",
  });
  if (response.ok) return (await response.json()) as T;
  const body = await errorBody(response);
  const code = typeof body?.api_error_code === "string" ? body.api_error_code : "";
  if (response.status === 401)
    throw new ProviderRequestError(
      "Chargebee rejected the key. It may have been deleted, or belong to another site.",
      401,
    );
  if (response.status === 403)
    throw new ProviderRequestError(
      "The key cannot read subscriptions and invoices. Use a read-only key with access to all data or to transactional data.",
      403,
      path,
    );
  if (response.status === 404 && code === "site_not_found")
    throw new ProviderRequestError(`Chargebee has no site called ${site}.`, 404);
  if (response.status === 429)
    throw new ProviderRequestError("Chargebee is rate limiting requests. Try again later.", 429);
  const message = typeof body?.message === "string" ? body.message.slice(0, 300) : null;
  throw new ProviderRequestError(`Chargebee returned an error${message ? `: ${message}` : "."}`);
}

type Page<T> = { list: T[]; next_offset?: string | null };

// Lists continue from the offset the previous page names.
async function listAll<T>(site: string, key: string, path: string, params: [string, string][]) {
  const items: T[] = [];
  let offset: string | null | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams([...params, ["limit", "100"]]);
    if (offset) query.set("offset", offset);
    const result = await chargebeeGet<Page<T>>(site, key, path, query);
    items.push(...result.list);
    offset = result.next_offset;
    if (!offset) return items;
  }
  throw tooMuchData("Chargebee", path);
}

/** Active subscriptions, which include past-due ones, and those set to cancel at term end. */
export async function fetchSubscriptions(site: string, key: string) {
  const read = (status: string) =>
    listAll<{ subscription: ChargebeeSubscription }>(site, key, "/subscriptions", [
      ["status[is]", status],
    ]);
  const lists = [await read("active"), await read("non_renewing")];
  return lists.flat().map((entry) => entry.subscription);
}

/** Paid subscription invoices dated after `since` (Unix seconds). */
export async function fetchInvoices(site: string, key: string, since: number) {
  const list = await listAll<{ invoice: ChargebeeInvoice }>(site, key, "/invoices", [
    ["status[is]", "paid"],
    ["recurring[is]", "true"],
    ["date[after]", String(since)],
  ]);
  return list.map((entry) => entry.invoice);
}
