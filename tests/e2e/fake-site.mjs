// A founder's DNS, for the tests only. The DNS server answers TXT lookups from records the tests
// set over HTTP (PUT or DELETE /dns/<name>, with a JSON array of values); a name without records
// does not exist.
import { createSocket } from "node:dgram";

const DNS_PORT = Number(process.env.FAKE_DNS_PORT || 3053);
const records = new Map();

// A name in a DNS message: labels, each after its length, up to a zero byte.
function readName(message, start) {
  const labels = [];
  let offset = start;
  while (offset < message.length && message[offset] !== 0) {
    const length = message[offset];
    labels.push(message.subarray(offset + 1, offset + 1 + length).toString("ascii"));
    offset += length + 1;
  }
  return { name: labels.join(".").toLowerCase(), end: offset + 1 };
}

// A TXT answer that points back at the question's name, its text in chunks of up to 255 bytes.
function txtAnswer(value) {
  const text = Buffer.from(value, "utf8");
  const chunks = [];
  for (let start = 0; start < text.length; start += 255) {
    const chunk = text.subarray(start, start + 255);
    chunks.push(Buffer.from([chunk.length]), chunk);
  }
  const data = Buffer.concat(chunks);
  const head = Buffer.alloc(12);
  head.writeUInt16BE(0xc00c, 0);
  head.writeUInt16BE(16, 2);
  head.writeUInt16BE(1, 4);
  head.writeUInt32BE(0, 6);
  head.writeUInt16BE(data.length, 10);
  return Buffer.concat([head, data]);
}

const dns = createSocket("udp4");
dns.on("message", (query, remote) => {
  if (query.length < 17) return;
  const { name, end } = readName(query, 12);
  const type = query.readUInt16BE(end);
  const values = records.get(name);
  const answers = type === 16 && values ? values : [];
  const header = Buffer.alloc(12);
  query.copy(header, 0, 0, 2);
  // A response with the recursion flag copied; a name without records does not exist (NXDOMAIN).
  header[2] = 0x84 | (query[2] & 0x01);
  header[3] = values ? 0x80 : 0x83;
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(answers.length, 6);
  const question = query.subarray(12, end + 4);
  dns.send(
    Buffer.concat([header, question, ...answers.map(txtAnswer)]),
    remote.port,
    remote.address,
  );
});
dns.bind(DNS_PORT, "127.0.0.1");

async function body(request) {
  const parts = [];
  for await (const part of request) parts.push(part);
  return Buffer.concat(parts).toString("utf8");
}

/** Handles the DNS records; returns false for anything else. */
export function handleSite(url, request, response) {
  const record = url.pathname.match(/^\/dns\/([^/]+)$/);
  if (record) {
    const name = decodeURIComponent(record[1]).toLowerCase();
    if (request.method === "DELETE") {
      records.delete(name);
      response.writeHead(204).end();
    } else
      body(request).then((text) => {
        records.set(name, JSON.parse(text));
        response.writeHead(204).end();
      });
    return true;
  }
  return false;
}
