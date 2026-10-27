import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VerificationError } from "../../src/lib/revenue/errors";
import {
  decodeOAuthFlow,
  encodeOAuthFlow,
  newOAuthFlow,
  oauthCallbackUrl,
  oauthFlowCookie,
  pkceChallenge,
  type OAuthFlow,
  type OAuthProvider,
} from "../../src/lib/revenue/oauth";
import { finishOAuth, startOAuth } from "../../src/lib/revenue/oauth-routes";
import { summary } from "../../src/lib/revenue/summary";
import type { Verification } from "../../src/lib/revenue/sync";

// The routes run with the session, the cookies, the database and the verification replaced, so
// each check of the flow can be seen on its own.
const state = vi.hoisted(() => ({
  jar: new Map<string, { value: string; options?: Record<string, unknown> }>(),
  deleted: [] as unknown[],
  userId: "user-1",
  owned: true,
  ownerFilters: [] as [string, unknown][],
  calls: [] as string[],
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const cookie = state.jar.get(name);
      return cookie ? { name, value: cookie.value } : undefined;
    },
    set: (name: string, value: string, options: Record<string, unknown>) =>
      void state.jar.set(name, { value, options }),
    delete: (cookie: { name: string }) => {
      state.deleted.push(cookie);
      state.jar.delete(cookie.name);
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(() => void state.calls.push("revalidate")) }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/email/outbox", () => ({
  sendQueuedEmails: vi.fn(() => void state.calls.push("emails")),
}));
vi.mock("@/lib/supabase/server", () => {
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      state.ownerFilters.push([column, value]);
      return query;
    },
    maybeSingle: async () => ({ data: state.owned ? { id: "owned" } : null }),
  };
  const client = { from: () => query };
  return { requireUser: vi.fn(async () => ({ user: { id: state.userId }, client })) };
});
vi.mock("../../src/lib/revenue/connect", () => ({
  beginRevenueCheck: vi.fn(async () => void state.calls.push("begin")),
  keepConnectionResult: vi.fn(async () => undefined),
}));
vi.mock("../../src/lib/revenue/sync", () => ({ connectProvider: vi.fn() }));

const { beginRevenueCheck, keepConnectionResult } = vi.mocked(
  await import("../../src/lib/revenue/connect"),
);
const { connectProvider } = vi.mocked(await import("../../src/lib/revenue/sync"));

// Addresses use the site's default.
delete process.env.NEXT_PUBLIC_SITE_URL;
const SAAS = "0d1c2b3a-4f5e-4a6b-8c7d-9e0f1a2b3c4d";
const SITE = "http://localhost:3001";
const verification = {
  provider: "gumroad",
  mrrCents: 5000,
  customers: 3,
  skippedItems: 1,
  mrrNote: null,
  historyNote: null,
} as unknown as Verification;

const exchange = vi.fn<OAuthProvider["exchange"]>();
let ready = true;
// Gumroad's id, so the names, addresses and messages are Gumroad's own.
const provider: OAuthProvider = {
  id: "gumroad",
  client: () => (ready ? { id: "client-1", secret: "secret-1" } : null),
  authorizeUrl: (client, flow) =>
    `https://provider.test/authorize?client=${client.id}&state=${flow.state}`,
  exchange,
};

beforeEach(() => {
  state.jar.clear();
  state.deleted = [];
  state.userId = "user-1";
  state.owned = true;
  state.ownerFilters = [];
  state.calls = [];
  ready = true;
  vi.clearAllMocks();
  exchange.mockImplementation(async () => {
    state.calls.push("exchange");
    return { key: "token", hint: "…oken", livemode: true };
  });
  connectProvider.mockImplementation(async () => {
    state.calls.push("connect");
    return verification;
  });
});

const location = (response: Response) => response.headers.get("location");
const lastResult = () => keepConnectionResult.mock.calls.at(-1)?.[0];

describe("OAuth flows", () => {
  it("keep each provider's cookie on its own routes and return to its callback", () => {
    expect(oauthFlowCookie("gumroad")).toEqual({
      name: "harbor_gumroad_flow",
      path: "/api/gumroad",
    });
    expect(oauthCallbackUrl("gumroad")).toBe(`${SITE}/api/gumroad/callback`);
  });

  it("are random, carry a PKCE verifier and come back only whole", () => {
    const flow = newOAuthFlow("saas-1", "user-1");
    expect(flow).toMatchObject({ saasId: "saas-1", userId: "user-1" });
    expect(flow.state).not.toBe(newOAuthFlow("saas-1", "user-1").state);
    expect(flow.verifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(pkceChallenge(flow.verifier)).toBe(
      createHash("sha256").update(flow.verifier).digest("base64url"),
    );
    expect(decodeOAuthFlow(encodeOAuthFlow(flow))).toEqual(flow);
    expect(decodeOAuthFlow(undefined)).toBeNull();
    expect(decodeOAuthFlow("not-json")).toBeNull();
    const partial = { ...flow, verifier: "" };
    expect(decodeOAuthFlow(Buffer.from(JSON.stringify(partial)).toString("base64url"))).toBeNull();
  });
});

describe("Starting a connection", () => {
  const start = (saas: string) =>
    startOAuth(new NextRequest(`${SITE}/api/gumroad/connect?saas=${saas}`), provider);

  it("leads back to the dashboard for anything but a product of the founder's", async () => {
    expect(location(await start("not-a-uuid"))).toBe(`${SITE}/dashboard`);
    state.owned = false;
    expect(location(await start(SAAS))).toBe(`${SITE}/dashboard`);
    expect(state.ownerFilters).toEqual([
      ["id", SAAS],
      ["owner_id", "user-1"],
    ]);
    expect(state.jar.size).toBe(0);
  });

  it("says so when the server is not set up for the provider", async () => {
    ready = false;
    expect(location(await start(SAAS))).toBe(`${SITE}/dashboard/saas/${SAAS}?connection=1#revenue`);
    expect(lastResult()).toEqual({
      saasId: SAAS,
      provider: "gumroad",
      tone: "error",
      text: "Gumroad is not set up on this server yet.",
    });
    expect(state.jar.size).toBe(0);
  });

  it("keeps the flow in a short-lived cookie and sends the founder to the provider", async () => {
    const response = await start(SAAS);
    const cookie = state.jar.get("harbor_gumroad_flow")!;
    expect(cookie.options).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 600,
      path: "/api/gumroad",
    });
    const flow = decodeOAuthFlow(cookie.value)!;
    expect(flow).toMatchObject({ saasId: SAAS, userId: "user-1" });
    expect(location(response)).toBe(
      `https://provider.test/authorize?client=client-1&state=${flow.state}`,
    );
  });
});

describe("Finishing a connection", () => {
  let flow: OAuthFlow;
  const finish = (query: string) =>
    finishOAuth(new NextRequest(`${SITE}/api/gumroad/callback?${query}`), provider);
  const editor = `${SITE}/dashboard/saas/${SAAS}?connection=1#revenue`;

  beforeEach(() => {
    flow = newOAuthFlow(SAAS, "user-1");
    state.jar.set("harbor_gumroad_flow", { value: encodeOAuthFlow(flow) });
  });

  it("leads back to the dashboard without a flow, or for another founder", async () => {
    state.jar.clear();
    expect(location(await finish("code=forged&state=forged"))).toBe(`${SITE}/dashboard`);
    state.jar.set("harbor_gumroad_flow", { value: encodeOAuthFlow(flow) });
    state.userId = "user-2";
    expect(location(await finish(`code=c&state=${flow.state}`))).toBe(`${SITE}/dashboard`);
    expect(keepConnectionResult).not.toHaveBeenCalled();
    expect(exchange).not.toHaveBeenCalled();
    // The flow is used once, whatever happens.
    expect(state.deleted).toEqual([
      { name: "harbor_gumroad_flow", path: "/api/gumroad" },
      { name: "harbor_gumroad_flow", path: "/api/gumroad" },
    ]);
  });

  it.each([
    ["another state", "state=other&code=c", "The connection to Gumroad expired. Try again."],
    [
      "a refusal",
      "error=access_denied",
      "Gumroad access was not approved, so nothing was connected.",
    ],
    ["no code", "", "Gumroad did not complete the connection. Try again."],
  ])("explains a return with %s", async (_, query, text) => {
    const full = query.startsWith("state=") ? query : `state=${flow.state}&${query}`;
    expect(location(await finish(full))).toBe(editor);
    expect(lastResult()).toEqual({ saasId: SAAS, provider: "gumroad", tone: "error", text });
    expect(exchange).not.toHaveBeenCalled();
  });

  it("exchanges nothing when the server is not set up or the product is someone else's", async () => {
    ready = false;
    await finish(`state=${flow.state}&code=c`);
    expect(lastResult()?.text).toBe("Gumroad is not set up on this server yet.");
    ready = true;
    state.owned = false;
    state.jar.set("harbor_gumroad_flow", { value: encodeOAuthFlow(flow) });
    await finish(`state=${flow.state}&code=c`);
    expect(lastResult()?.text).toBe("You can only verify revenue for your own SaaS.");
    expect(beginRevenueCheck).not.toHaveBeenCalled();
    expect(exchange).not.toHaveBeenCalled();
  });

  it("counts the check, exchanges the code and connects what it gives", async () => {
    const query = `state=${flow.state}&code=the-code&accounts-server=https%3A%2F%2Faccounts.zoho.in`;
    expect(location(await finish(query))).toBe(editor);
    expect(state.calls).toEqual(["begin", "exchange", "connect", "emails", "revalidate"]);
    expect(beginRevenueCheck.mock.calls[0]?.[1]).toBe(SAAS);
    expect(beginRevenueCheck.mock.calls[0]?.[2]).toBe(false);
    const [app, callback] = exchange.mock.calls[0]!;
    expect(app).toEqual({ id: "client-1", secret: "secret-1" });
    expect(callback.code).toBe("the-code");
    expect(callback.verifier).toBe(flow.verifier);
    expect(callback.params.get("accounts-server")).toBe("https://accounts.zoho.in");
    expect(connectProvider).toHaveBeenCalledWith(SAAS, "gumroad", {
      key: "token",
      hint: "…oken",
      livemode: true,
    });
    expect(lastResult()).toEqual({
      saasId: SAAS,
      provider: "gumroad",
      tone: "success",
      text: `Gumroad connected. ${summary(verification)}`,
    });
  });

  it("shows failures written for founders, and others as a generic failure", async () => {
    exchange.mockRejectedValueOnce(new VerificationError("Gumroad granted other access."));
    await finish(`state=${flow.state}&code=c`);
    expect(lastResult()).toMatchObject({ tone: "error", text: "Gumroad granted other access." });
    expect(connectProvider).not.toHaveBeenCalled();

    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    exchange.mockRejectedValueOnce(new Error("socket hang up"));
    state.jar.set("harbor_gumroad_flow", { value: encodeOAuthFlow(flow) });
    await finish(`state=${flow.state}&code=c`);
    expect(lastResult()?.text).toBe("Verification failed. Try again shortly.");
    logged.mockRestore();

    beginRevenueCheck.mockRejectedValueOnce(new VerificationError("Too many checks."));
    state.jar.set("harbor_gumroad_flow", { value: encodeOAuthFlow(flow) });
    exchange.mockClear();
    await finish(`state=${flow.state}&code=c`);
    expect(lastResult()?.text).toBe("Too many checks.");
    expect(exchange).not.toHaveBeenCalled();
  });
});
