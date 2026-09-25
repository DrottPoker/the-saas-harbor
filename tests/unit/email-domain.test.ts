import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { domainAcceptsMail } = await import("../../src/lib/email-domain");

const failure = (code: string) => Object.assign(new Error(code), { code });

// A stand-in for DNS: each lookup returns its records or throws the given error code.
function resolver({
  mx = [] as { exchange: string; priority: number }[] | string,
  a = [] as string[] | string,
  aaaa = [] as string[] | string,
}) {
  const answer =
    <T>(value: T[] | string) =>
    async () => {
      if (typeof value === "string") throw failure(value);
      return value;
    };
  return { resolveMx: answer(mx), resolve4: answer(a), resolve6: answer(aaaa) } as never;
}

describe("domainAcceptsMail", () => {
  it("accepts a domain with mail servers", async () => {
    const mx = [{ exchange: "mx.example.org", priority: 10 }];
    expect(await domainAcceptsMail("gmail.com", resolver({ mx }))).toBe(true);
  });

  it("refuses a domain that does not exist, such as a typo", async () => {
    expect(await domainAcceptsMail("gmail.con", resolver({ mx: "ENOTFOUND" }))).toBe(false);
  });

  it("refuses a domain that says it takes no mail", async () => {
    const mx = [{ exchange: ".", priority: 0 }];
    expect(await domainAcceptsMail("example.com", resolver({ mx, a: ["192.0.2.1"] }))).toBe(false);
  });

  it("falls back to the domain's own address without MX records", async () => {
    expect(await domainAcceptsMail("a.dev", resolver({ mx: "ENODATA", a: ["192.0.2.1"] }))).toBe(
      true,
    );
    expect(
      await domainAcceptsMail("b.dev", resolver({ mx: "ENODATA", a: "ENODATA", aaaa: "ENODATA" })),
    ).toBe(false);
  });

  it("does not block sign-up when DNS itself fails", async () => {
    expect(await domainAcceptsMail("slow.dev", resolver({ mx: "ETIMEOUT" }))).toBe(true);
  });
});
