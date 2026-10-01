// The browser tests' server: the production build that scripts/test-local.mjs makes, served as on
// Vercel. `next start` answers requests for an intercepted route, such as the sign-in dialog, with
// an empty x-nextjs-rewritten-query header: its router compares the address's query with the
// rewrite destination's own, which has none (Next.js 16.3.8, resolve-routes). The client then files
// a prefetched /auth?mode=signup as /auth, and following the link keeps the form on screen. Vercel
// routes these requests itself and sends no such header, so this server leaves it out too.
import { createServer } from "node:http";

process.env.NODE_ENV ??= "production";
const { default: next } = await import("next");

const hostname = "127.0.0.1";
const port = Number(process.env.PORT || 3002);
const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();

createServer((request, response) => {
  const setHeader = response.setHeader.bind(response);
  response.setHeader = (name, value) =>
    name.toLowerCase() === "x-nextjs-rewritten-query" ? response : setHeader(name, value);
  handle(request, response);
}).listen(port, hostname, () => console.log(`Test server on http://${hostname}:${port}`));
