import { describe, expect, it } from "vitest";
import { isPublicAddress } from "../../src/lib/screenshots/address";

describe("addresses a screenshot may reach", () => {
  it.each([
    "93.184.216.34",
    "1.1.1.1",
    "8.8.8.8",
    "2606:4700:4700::1111",
    "2a00:1450:4001:80b::200e",
    "::ffff:93.184.216.34",
  ])("include the public address %s", (address) => expect(isPublicAddress(address)).toBe(true));

  it.each([
    ["the machine itself", "127.0.0.1"],
    ["the machine itself over IPv6", "::1"],
    ["no address", "0.0.0.0"],
    ["a private network", "10.1.2.3"],
    ["a private network", "172.16.0.1"],
    ["a private network", "172.31.255.254"],
    ["a private network", "192.168.1.1"],
    ["a carrier network", "100.64.0.1"],
    ["a cloud metadata service", "169.254.169.254"],
    ["a documentation range", "192.0.2.10"],
    ["a benchmarking range", "198.18.0.1"],
    ["multicast", "224.0.0.1"],
    ["a reserved range", "240.0.0.1"],
    ["broadcast", "255.255.255.255"],
    ["a unique local IPv6 network", "fd12:3456::1"],
    ["IPv6 link-local", "fe80::1"],
    ["IPv6 multicast", "ff02::1"],
    ["a private address inside IPv6", "::ffff:127.0.0.1"],
    ["a private address inside IPv6", "::ffff:169.254.169.254"],
    ["a mapped address written in hexadecimal", "::ffff:7f00:1"],
    ["NAT64 of a private address", "64:ff9b::10.0.0.1"],
    ["the IPv6 documentation range", "2001:db8::1"],
    ["a name, not an address", "localhost"],
    ["nothing", ""],
  ])("exclude %s (%s)", (_, address) => expect(isPublicAddress(address)).toBe(false));
});
