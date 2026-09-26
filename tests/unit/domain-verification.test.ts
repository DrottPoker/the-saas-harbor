import { describe, expect, it } from "vitest";
import {
  lookupDomainRecord,
  recordName,
  recordValue,
  websiteDomain,
} from "../../src/lib/domain-verification";

const token = "0123456789abcdef0123456789abcdef";
const failure = (code: string) => Object.assign(new Error(code), { code });

// A stand-in for DNS: TXT records as chunks, or the error code a lookup throws.
function resolver(answer: string[][] | string) {
  return {
    resolveTxt: async () => {
      if (typeof answer === "string") throw failure(answer);
      return answer;
    },
  } as never;
}

describe("a website's domain", () => {
  it.each([
    ["https://example.com", "example.com"],
    ["https://www.Example.com/pricing?plan=pro", "example.com"],
    ["http://app.example.co.uk:8080/", "app.example.co.uk"],
    ["https://example.com./", "example.com"],
    ["https://bücher.example/", "xn--bcher-kva.example"],
  ])("of %s is %s", (website, domain) => expect(websiteDomain(website)).toBe(domain));

  it.each([
    "https://192.0.2.10/",
    "http://[2001:db8::1]/",
    "http://localhost:3000",
    "http://preview.localhost",
    "not a url",
    "",
    null,
  ])("does not exist for %s", (website) => expect(websiteDomain(website)).toBeNull());
});

describe("the record", () => {
  it("has a name under the domain and a value with the product's token", () => {
    expect(recordName("example.com")).toBe("_thesaasharbor.example.com");
    expect(recordValue(token)).toBe(`thesaasharbor-verification=${token}`);
  });

  it("is found among other TXT records, even in chunks", async () => {
    const value = recordValue(token);
    expect(
      await lookupDomainRecord("example.com", token, resolver([["v=spf1 -all"], [value]])),
    ).toBe("found");
    expect(
      await lookupDomainRecord(
        "example.com",
        token,
        resolver([[value.slice(0, 20), value.slice(20)]]),
      ),
    ).toBe("found");
  });

  it("is missing when another token or no record is there", async () => {
    expect(
      await lookupDomainRecord("example.com", token, resolver([[recordValue("f".repeat(32))]])),
    ).toBe("missing");
    expect(await lookupDomainRecord("example.com", token, resolver("ENOTFOUND"))).toBe("missing");
    expect(await lookupDomainRecord("example.com", token, resolver("ENODATA"))).toBe("missing");
  });

  it("is not judged when DNS fails", async () => {
    expect(await lookupDomainRecord("example.com", token, resolver("ETIMEOUT"))).toBe("error");
    expect(await lookupDomainRecord("example.com", token, resolver("ESERVFAIL"))).toBe("error");
  });
});
