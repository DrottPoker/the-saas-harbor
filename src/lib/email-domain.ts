import "server-only";
import { Resolver } from "node:dns/promises";

// Whether an address's domain can receive email, checked in DNS before sign-up, so a typo such as
// gmail.con fails at once instead of in a confirmation email that never arrives. The confirmation
// email is still what proves the address works.

type MailResolver = Pick<Resolver, "resolveMx" | "resolve4" | "resolve6">;

function defaultResolver(): MailResolver {
  return new Resolver({ timeout: 2500, tries: 2 });
}

const code = (error: unknown) => (error as { code?: string } | null)?.code;

// A domain that does not exist, or says it takes no mail (a "null MX", RFC 7505), cannot receive
// email. Without MX records, mail goes to the domain's own address (RFC 5321), so that counts too.
// When DNS itself fails, the address is given the benefit of the doubt: an outage should not stop
// sign-ups.
export async function domainAcceptsMail(domain: string, resolver = defaultResolver()) {
  try {
    const records = await resolver.resolveMx(domain);
    if (records.length > 0) return records.some((record) => !["", "."].includes(record.exchange));
  } catch (error) {
    if (code(error) === "ENOTFOUND") return false;
    if (code(error) !== "ENODATA") return true;
  }
  for (const lookup of [() => resolver.resolve4(domain), () => resolver.resolve6(domain)]) {
    try {
      if ((await lookup()).length > 0) return true;
    } catch (error) {
      if (!["ENOTFOUND", "ENODATA"].includes(code(error) ?? "")) return true;
    }
  }
  return false;
}

/**
 * The DNS check runs only for a site served over https. Locally and in the browser tests, the
 * addresses use reserved test domains that never resolve, and Mailpit catches every email.
 */
export async function addressAcceptsMail(email: string) {
  if (!(process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://")) return true;
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  return domainAcceptsMail(domain);
}
