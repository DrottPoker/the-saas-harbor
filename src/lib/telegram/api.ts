import "server-only";

// The Telegram Bot API, for alerts to the owner's chat. TELEGRAM_API_BASE points the tests at a
// fake server.
const TIMEOUT_MS = 10_000;

export type TelegramConfig = { token: string; chatId: string; base: string };

/** The bot and the chat from the environment, or null while Telegram is not set up. */
export function telegramConfig(): TelegramConfig | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return null;
  const base = (process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/$/, "");
  return { token, chatId, base };
}

/** A refused or failed request, with Telegram's reason and, when rate limited, the wait in seconds. */
export class TelegramError extends Error {
  readonly retryAfter: number | null;
  constructor(message: string, retryAfter: number | null = null) {
    super(message);
    this.retryAfter = retryAfter;
  }
}

type Answer = { ok?: unknown; description?: unknown; parameters?: { retry_after?: unknown } };

/** Sends a message in Telegram's HTML. Errors never contain the token, which is in the URL. */
export async function sendTelegramMessage(config: TelegramConfig, html: string) {
  let response: Response;
  try {
    response = await fetch(`${config.base}/bot${config.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: html,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new TelegramError("Telegram could not be reached");
  }
  const answer = (await response.json().catch(() => null)) as Answer | null;
  if (response.ok && answer?.ok === true) return;
  const retryAfter = answer?.parameters?.retry_after;
  throw new TelegramError(
    typeof answer?.description === "string"
      ? answer.description.slice(0, 200)
      : `Telegram answered with HTTP ${response.status}`,
    typeof retryAfter === "number" && retryAfter > 0 ? Math.ceil(retryAfter) : null,
  );
}
