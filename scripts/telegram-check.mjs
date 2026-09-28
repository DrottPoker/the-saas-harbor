import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Sets up Telegram alerts (see README). With TELEGRAM_BOT_TOKEN in .env.local it lists the chats
// that have written to the bot, to find TELEGRAM_CHAT_ID; with that as well, it sends a test
// message there. The token is never printed.
const env = existsSync(".env.local") ? parseEnv(readFileSync(".env.local", "utf8")) : {};
const token = env.TELEGRAM_BOT_TOKEN?.trim();
if (!token)
  throw new Error("Add TELEGRAM_BOT_TOKEN=<the token from @BotFather> to .env.local first.");
// A token is the bot's number, a colon and a code; Telegram answers Not Found for anything else.
if (!/^\d+:[\w-]+$/.test(token))
  throw new Error(
    "TELEGRAM_BOT_TOKEN in .env.local is not a whole bot token. Copy all of it from @BotFather: " +
      "the bot's number, a colon and a code, such as 123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw.",
  );
const base = (env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/$/, "");

async function call(method, body = {}) {
  const response = await fetch(`${base}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {
    throw new Error("Telegram could not be reached.");
  });
  const answer = await response.json().catch(() => null);
  if (!answer?.ok)
    throw new Error(
      `Telegram refused ${method}: ${answer?.description ?? `HTTP ${response.status}`}`,
    );
  return answer.result;
}

const bot = await call("getMe");
console.log(`Bot: @${bot.username}`);
const chatId = env.TELEGRAM_CHAT_ID?.trim();
if (chatId) {
  await call("sendMessage", {
    chat_id: chatId,
    text: "The SaaS Harbor is connected. New accounts and feedback will show up here.",
  });
  console.log(`Sent a test message to chat ${chatId}.`);
} else {
  const chats = new Map();
  for (const update of await call("getUpdates")) {
    const chat = (update.message ?? update.my_chat_member ?? update.channel_post)?.chat;
    if (chat) chats.set(String(chat.id), chat);
  }
  if (!chats.size) {
    console.log(
      `No chats yet. Open https://t.me/${bot.username}, press Start, then run this again.`,
    );
  } else {
    console.log("Chats that wrote to the bot:");
    for (const chat of chats.values()) {
      const name =
        chat.title ?? ([chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.type);
      console.log(`  TELEGRAM_CHAT_ID=${chat.id}  (${name})`);
    }
    console.log("Add the right line to .env.local and run this again to send a test message.");
  }
}
