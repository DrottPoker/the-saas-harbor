import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, createNonce } from "../../src/lib/csp";

const directive = (policy: string, name: string) =>
  policy
    .split("; ")
    .find((part) => part.split(" ")[0] === name)
    ?.split(" ")
    .slice(1);

describe("content security policy", () => {
  const production = contentSecurityPolicy({
    nonce: "abc123",
    supabaseUrl: "https://db.example.com/",
    development: false,
    https: true,
  });

  it("runs only scripts that carry the nonce, and never eval in production", () => {
    expect(directive(production, "script-src")).toEqual([
      "'self'",
      "'nonce-abc123'",
      "'strict-dynamic'",
    ]);
    expect(production).not.toContain("unsafe-eval");
  });
  it("allows Supabase images, requests and the Realtime websocket", () => {
    expect(directive(production, "img-src")).toContain("https://db.example.com");
    expect(directive(production, "connect-src")).toEqual([
      "'self'",
      "https://db.example.com",
      "wss://db.example.com",
    ]);
  });
  it("blocks framing, plugins, foreign form targets and base URLs", () => {
    expect(directive(production, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(production, "object-src")).toEqual(["'none'"]);
    expect(directive(production, "form-action")).toEqual(["'self'"]);
    expect(directive(production, "base-uri")).toEqual(["'self'"]);
    expect(directive(production, "upgrade-insecure-requests")).toEqual([]);
  });
  it("allows eval and plain http only in local development", () => {
    const local = contentSecurityPolicy({
      nonce: "n",
      supabaseUrl: "http://127.0.0.1:55321",
      development: true,
      https: false,
    });
    expect(directive(local, "script-src")).toContain("'unsafe-eval'");
    expect(directive(local, "connect-src")).toContain("ws://127.0.0.1:55321");
    expect(directive(local, "upgrade-insecure-requests")).toBeUndefined();
  });
  it("creates a different 128-bit nonce each time", () => {
    const nonce = createNonce();
    expect(atob(nonce)).toHaveLength(16);
    expect(createNonce()).not.toBe(nonce);
  });
});
