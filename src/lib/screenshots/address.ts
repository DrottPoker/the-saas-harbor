import { BlockList, isIP } from "node:net";

// Addresses a screenshot must never reach: the machine itself, private networks, link-local
// addresses (such as a cloud's metadata service), and ranges that are reserved or not routed on
// the internet. A founder's website, or anything it loads or redirects to, could point at them.
const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(network, prefix, "ipv4");
// IPv4 addresses written inside IPv6 ones are checked as IPv4 below when written with dots; the
// same ranges in hexadecimal are refused outright. (Mapped ::ffff: addresses are refused in code:
// a BlockList rule for them would also match every IPv4 address.)
for (const [network, prefix] of [
  ["::", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(network, prefix, "ipv6");

/** An IPv4 address embedded in an IPv6 one (mapped, compatible or NAT64), or null. */
function embeddedIpv4(address: string) {
  const match = address.toLowerCase().match(/^(?:::ffff:|::|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  return match?.[1] ?? null;
}

/** Whether a screenshot may connect to this address: a public IPv4 or IPv6 address. */
export function isPublicAddress(address: string) {
  const version = isIP(address);
  if (!version) return false;
  if (version === 6) {
    const v4 = embeddedIpv4(address);
    if (v4) return isPublicAddress(v4);
    if (/^::ffff:/i.test(address)) return false;
    return !blocked.check(address, "ipv6");
  }
  return !blocked.check(address, "ipv4");
}
