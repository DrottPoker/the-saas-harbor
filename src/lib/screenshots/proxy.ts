import "server-only";
import { createServer, request as httpRequest, type IncomingMessage } from "node:http";
import { lookup } from "node:dns/promises";
import { connect, isIP, type AddressInfo, type Socket } from "node:net";
import { isPublicAddress } from "./address";

// The screenshot browser sends every request through this proxy, which looks each host up itself
// and connects only to public addresses. Checking in the browser would not be enough: a page may
// redirect, load resources or open sockets anywhere, and a name may resolve differently the second
// time. The proxy connects to the very address it checked.

const TIMEOUT_MS = 15_000;

async function openSocket(host: string, port: number, allowPrivate: boolean) {
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host.replace(/^\[|\]$/g, ""), { all: true, verbatim: true });
  // Every address must be public, so a name cannot mix a public and a private one.
  if (!addresses.length || (!allowPrivate && !addresses.every((a) => isPublicAddress(a.address))))
    throw new Error("Refused address");
  return new Promise<Socket>((resolve, reject) => {
    const socket = connect({ host: addresses[0].address, port });
    socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error("Timed out")));
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

// "example.com:443" or "[2001:db8::1]:443"
function hostAndPort(authority: string, fallback: number) {
  const match = authority.match(/^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/);
  if (!match) return null;
  const port = Number(match[2] ?? fallback);
  return port > 0 && port < 65536 ? { host: match[1].replace(/^\[|\]$/g, ""), port } : null;
}

const HOP_BY_HOP = ["proxy-connection", "proxy-authorization", "connection", "keep-alive"];

/**
 * Starts the proxy on a free loopback port. `allowPrivate` lets the browser tests reach their
 * local stand-in site; it is never set in production.
 */
export async function startGuardProxy({ allowPrivate = false } = {}) {
  // Tunnels leave the server's own bookkeeping, so they are closed from here.
  const tunnels = new Set<Socket>();
  const track = (socket: Socket) => {
    tunnels.add(socket);
    socket.once("close", () => tunnels.delete(socket));
  };
  const server = createServer((request: IncomingMessage, response) => {
    // Plain http: the browser sends the full address.
    let target: URL;
    try {
      target = new URL(request.url ?? "");
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (target.protocol !== "http:") {
      response.writeHead(400).end();
      return;
    }
    const address = hostAndPort(target.host, 80);
    if (!address) {
      response.writeHead(400).end();
      return;
    }
    openSocket(address.host, address.port, allowPrivate).then(
      (socket) => {
        const headers: Record<string, string | string[] | undefined> = {
          ...request.headers,
          host: target.host,
        };
        for (const name of HOP_BY_HOP) delete headers[name];
        const upstream = httpRequest(
          {
            // Without an agent, the request uses this socket and closes it afterwards.
            createConnection: () => socket,
            method: request.method,
            path: `${target.pathname}${target.search}`,
            headers,
          },
          (reply) => {
            response.writeHead(reply.statusCode ?? 502, reply.headers);
            reply.pipe(response);
          },
        );
        upstream.on("error", () => response.destroy());
        request.pipe(upstream);
      },
      () => response.writeHead(403).end(),
    );
  });
  // https and WebSockets: a tunnel to the checked address.
  server.on("connect", (request: IncomingMessage, client: Socket, head: Buffer) => {
    const address = hostAndPort(request.url ?? "", 443);
    track(client);
    client.on("error", () => client.destroy());
    if (!address) {
      client.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }
    openSocket(address.host, address.port, allowPrivate).then(
      (upstream) => {
        track(upstream);
        upstream.setTimeout(0);
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
        upstream.on("error", () => client.destroy());
      },
      () => client.end("HTTP/1.1 403 Forbidden\r\n\r\n"),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of tunnels) socket.destroy();
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
