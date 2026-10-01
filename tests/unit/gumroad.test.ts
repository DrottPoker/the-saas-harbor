import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  countedSubscribers,
  gumroadMrr,
  gumroadServiceLines,
  isMembership,
  latestCharges,
  recurrenceMonths,
  salesWindowStart,
  type GumroadSale,
  type GumroadSubscriber,
} from "../../src/lib/revenue/gumroad/mrr";
import {
  connectionResultPath,
  decodeConnectionResult,
  encodeConnectionResult,
} from "../../src/lib/revenue/connection-result";
import {
  decodeGumroadFlow,
  encodeGumroadFlow,
  gumroadAuthorizeUrl,
  newGumroadFlow,
  readOnlyScopes,
} from "../../src/lib/revenue/gumroad/oauth";
import { summaryPayments } from "../../src/lib/revenue/gumroad/payments";

const at = (iso: string) => Date.parse(iso) / 1000;
const NOW = new Date("2026-09-28T12:00:00Z");

function subscriber(overrides: Partial<GumroadSubscriber> = {}): GumroadSubscriber {
  return {
    id: "sub_1",
    product_id: "prod_member",
    user_id: "gu_1",
    status: "alive",
    recurrence: "monthly",
    free_trial_ends_at: null,
    ...overrides,
  };
}

function sale(overrides: Partial<GumroadSale> = {}): GumroadSale {
  return {
    id: "sale_1",
    created_at: "2026-09-01T09:00:00Z",
    price: 2000,
    subscription_id: "sub_1",
    subscription_duration: "monthly",
    is_upgrade_purchase: false,
    refunded: false,
    ...overrides,
  };
}

describe("Gumroad memberships", () => {
  it("knows its billing periods and membership products", () => {
    expect(
      ["monthly", "quarterly", "biannually", "yearly", "every_two_years"].map(recurrenceMonths),
    ).toEqual([1, 3, 6, 12, 24]);
    expect(recurrenceMonths("weekly")).toBeNull();
    expect(isMembership({ id: "a", is_tiered_membership: true })).toBe(true);
    expect(isMembership({ id: "b", subscription_duration: "monthly" })).toBe(true);
    expect(isMembership({ id: "c", is_tiered_membership: false })).toBe(false);
  });

  it("counts active subscribers past their free trial", () => {
    const now = at("2026-09-28T12:00:00Z");
    const counted = countedSubscribers(
      [
        subscriber({ id: "alive" }),
        subscriber({ id: "cancelling", status: "pending_cancellation" }),
        subscriber({ id: "retrying", status: "pending_failure" }),
        subscriber({ id: "trial", free_trial_ends_at: "2026-10-02T00:00:00Z" }),
        subscriber({ id: "after_trial", free_trial_ends_at: "2026-09-01T00:00:00Z" }),
        subscriber({ id: "cancelled", status: "cancelled" }),
      ],
      now,
    );
    expect(counted.map((s) => s.id)).toEqual(["alive", "cancelling", "retrying", "after_trial"]);
  });

  it("reads back one billing period and a month for the latest charges", () => {
    expect(salesWindowStart([subscriber()], NOW)).toBe(at("2026-07-28T00:00:00Z"));
    expect(salesWindowStart([subscriber(), subscriber({ recurrence: "yearly" })], NOW)).toBe(
      at("2025-08-28T00:00:00Z"),
    );
  });

  it("values each subscriber by its latest charge for a whole period, in US cents", () => {
    const latest = latestCharges([
      sale({ id: "old", created_at: "2026-08-01T09:00:00Z", price: 1500 }),
      sale({ id: "new" }),
      sale({
        id: "upgrade",
        created_at: "2026-09-10T09:00:00Z",
        price: 700,
        is_upgrade_purchase: true,
      }),
      sale({
        id: "yearly",
        subscription_id: "sub_2",
        subscription_duration: "yearly",
        price: 24000,
      }),
      sale({ id: "ebook", subscription_id: null, price: 1500 }),
    ]);
    expect([...latest].map(([id, s]) => [id, s.id])).toEqual([
      ["sub_1", "new"],
      ["sub_2", "yearly"],
    ]);
    expect(
      gumroadMrr(
        [
          subscriber(),
          subscriber({ id: "sub_2", user_id: "gu_2", recurrence: "yearly" }),
          subscriber({ id: "sub_3", user_id: "gu_3" }),
        ],
        latest,
      ),
    ).toEqual({
      byCurrency: { usd: 4000 },
      customers: 2,
      subscriptionIds: ["sub_1", "sub_2", "sub_3"],
      skippedItems: 1,
    });
  });

  it("counts charges over the period they pay for, leaving out refunds and upgrades", () => {
    expect(
      gumroadServiceLines([
        sale(),
        sale({
          id: "yearly",
          created_at: "2026-02-15T00:00:00Z",
          subscription_duration: "yearly",
          price: 24000,
        }),
        sale({ id: "refunded", refunded: true }),
        sale({ id: "upgrade", is_upgrade_purchase: true }),
        sale({ id: "ebook", subscription_id: null }),
      ]),
    ).toEqual([
      {
        start: at("2026-09-01T09:00:00Z"),
        end: at("2026-10-01T09:00:00Z"),
        currency: "usd",
        monthly: 2000,
      },
      {
        start: at("2026-02-15T00:00:00Z"),
        end: at("2027-02-15T00:00:00Z"),
        currency: "usd",
        monthly: 2000,
      },
    ]);
  });
});

describe("Gumroad revenue", () => {
  it("counts each day of the summary in the window as a payment of the account", () => {
    expect(
      summaryPayments(
        "gum_user",
        [
          { key: "2026-09-01", net_cents: 2000 },
          { key: "2026-09-02", net_cents: 0 },
          { key: "2026-09-20", net_cents: 1500 },
          { key: "not-a-day", net_cents: 99 },
        ],
        at("2026-09-01T00:00:00Z"),
        at("2026-09-20T00:00:00Z"),
      ),
    ).toEqual([
      {
        id: "gum_user:2026-09-01",
        at: at("2026-09-01T00:00:00Z"),
        fingerprint: "2000",
        value: { currency: "usd", amount: 2000 },
      },
    ]);
  });
});

describe("Gumroad OAuth", () => {
  it("asks for read access to sales only, with a PKCE challenge", () => {
    // Other test files may point Gumroad at the fake server in the same process.
    const saved = [process.env.GUMROAD_OAUTH_BASE, process.env.NEXT_PUBLIC_SITE_URL];
    delete process.env.GUMROAD_OAUTH_BASE;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const flow = newGumroadFlow("saas-1", "user-1");
    const url = new URL(gumroadAuthorizeUrl("client-1", flow));
    expect(url.origin + url.pathname).toBe("https://gumroad.com/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "client-1",
      redirect_uri: "http://localhost:3001/api/gumroad/callback",
      response_type: "code",
      scope: "view_sales",
      state: flow.state,
      code_challenge: createHash("sha256").update(flow.verifier).digest("base64url"),
      code_challenge_method: "S256",
    });
    expect(flow.state).not.toBe(newGumroadFlow("saas-1", "user-1").state);
    if (saved[0] !== undefined) process.env.GUMROAD_OAUTH_BASE = saved[0];
    if (saved[1] !== undefined) process.env.NEXT_PUBLIC_SITE_URL = saved[1];
  });

  it("accepts tokens that only read sales", () => {
    expect(readOnlyScopes(["view_sales"])).toBe(true);
    expect(readOnlyScopes(["view_sales", "view_public"])).toBe(true);
    expect(readOnlyScopes(["view_public"])).toBe(false);
    expect(readOnlyScopes(["view_sales", "edit_products"])).toBe(false);
    expect(readOnlyScopes(["view_sales", "account"])).toBe(false);
  });

  it("carries the flow and the outcome in cookies, and ignores anything else", () => {
    const flow = newGumroadFlow("saas-1", "user-1");
    expect(decodeGumroadFlow(encodeGumroadFlow(flow))).toEqual(flow);
    expect(decodeGumroadFlow("not-json")).toBeNull();
    expect(decodeGumroadFlow(Buffer.from('{"state":""}').toString("base64url"))).toBeNull();
    const result = {
      saasId: "saas-1",
      provider: "gumroad" as const,
      tone: "error" as const,
      text: "Try again.",
      at: 1,
    };
    expect(decodeConnectionResult(encodeConnectionResult(result))).toEqual(result);
    const crafted = (value: object) =>
      decodeConnectionResult(Buffer.from(JSON.stringify(value)).toString("base64url"));
    expect(crafted({ ...result, tone: "bold" })).toBeNull();
    expect(crafted({ ...result, provider: "paypal" })).toBeNull();
    expect(crafted({ ...result, at: "now" })).toBeNull();
    expect(decodeConnectionResult("not-json")).toBeNull();
    expect(connectionResultPath("saas-1")).toBe("/dashboard/saas/saas-1?connection=1#revenue");
  });
});
