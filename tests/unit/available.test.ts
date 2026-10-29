import { afterEach, describe, expect, it, vi } from "vitest";
import { availableProviders, oauthReadyProviders } from "../../src/lib/revenue/available";
import { PROVIDER_IDS, providerList } from "../../src/lib/revenue/catalog";
import { chosenProvider } from "../../src/lib/revenue/connect";
import { VerificationError } from "../../src/lib/revenue/errors";

const OAUTH_ENV = {
  gumroad: ["GUMROAD_CLIENT_ID", "GUMROAD_CLIENT_SECRET"],
  zoho: ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET"],
  mercadopago: ["MERCADOPAGO_CLIENT_ID", "MERCADOPAGO_CLIENT_SECRET"],
} as const;

/** Sets up this server's applications with the providers given, and no others. */
function setUp(...providers: (keyof typeof OAUTH_ENV)[]) {
  for (const [provider, names] of Object.entries(OAUTH_ENV))
    for (const name of names)
      vi.stubEnv(name, providers.includes(provider as keyof typeof OAUTH_ENV) ? "set" : "");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("available providers", () => {
  it("leaves out a provider connected through OAuth until its application is set up", () => {
    setUp("gumroad");
    expect(oauthReadyProviders()).toEqual(["gumroad"]);
    const available = availableProviders();
    expect(available).toContain("gumroad");
    expect(available).not.toContain("zoho");
    expect(available).not.toContain("mercadopago");
    // Providers with a pasted key need nothing on the server.
    expect(available).toEqual(PROVIDER_IDS.filter((id) => id !== "zoho" && id !== "mercadopago"));
  });

  it("offers every provider once each application is set up", () => {
    setUp("gumroad", "zoho", "mercadopago");
    expect(availableProviders()).toEqual(PROVIDER_IDS);
  });

  it("needs both the client ID and the secret", () => {
    setUp();
    vi.stubEnv("ZOHO_CLIENT_ID", "set");
    expect(availableProviders()).not.toContain("zoho");
  });

  it("names only the available providers in a sentence", () => {
    setUp();
    const sentence = providerList("or", availableProviders());
    expect(sentence).not.toMatch(/Gumroad|Zoho Billing|Mercado Pago/);
    expect(sentence).toMatch(/^Stripe, Paddle, .* or Google Play$/);
  });

  it("refuses a provider this server cannot connect, as the form does not offer it", () => {
    setUp("gumroad");
    const form = new FormData();
    form.set("provider", "zoho");
    expect(() => chosenProvider(form)).toThrow(
      new VerificationError("common.notSetUp", { provider: "Zoho Billing" }),
    );
    form.set("provider", "gumroad");
    expect(chosenProvider(form)).toEqual({ provider: "gumroad", key: null });
  });
});
