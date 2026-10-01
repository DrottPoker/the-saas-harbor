// Hosts on this machine. A plain connection to them never leaves it, so the browser tests' fake
// servers and local Mailpit may use one; anything that carries keys elsewhere needs TLS.
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function isLoopbackHost(host: string) {
  return LOOPBACK_HOSTS.has(host.toLowerCase());
}

/** Whether an address is https, or plain http to this machine. */
export function isSecureOrLocalUrl(address: string) {
  try {
    const { protocol, hostname } = new URL(address);
    return protocol === "https:" || (protocol === "http:" && isLoopbackHost(hostname));
  } catch {
    return false;
  }
}
