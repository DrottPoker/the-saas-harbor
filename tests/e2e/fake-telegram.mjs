// A stand-in for the Telegram Bot API, for the tests only, under /telegram. It accepts messages
// for the test bot's chat and keeps them; GET /telegram/messages lists them.
export const TELEGRAM = { token: "4242424242:harbor-test-telegram-token", chatId: "4242" };

const messages = [];

export async function handleTelegram(url, request, response) {
  if (!url.pathname.startsWith("/telegram/")) return false;
  const send = (status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
    return true;
  };
  if (request.method === "GET" && url.pathname === "/telegram/messages") return send(200, messages);
  const method = url.pathname.match(/^\/telegram\/bot([^/]+)\/sendMessage$/);
  if (!method || request.method !== "POST")
    return send(404, { ok: false, error_code: 404, description: "Not Found" });
  if (method[1] !== TELEGRAM.token)
    return send(401, { ok: false, error_code: 401, description: "Unauthorized" });
  let body = "";
  for await (const chunk of request) body += chunk;
  const { chat_id: chat, text, parse_mode: mode } = JSON.parse(body);
  if (String(chat) !== TELEGRAM.chatId)
    return send(400, { ok: false, error_code: 400, description: "Bad Request: chat not found" });
  messages.push({ text, parse_mode: mode });
  return send(200, { ok: true, result: { message_id: messages.length } });
}
