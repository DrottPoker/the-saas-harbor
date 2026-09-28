import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAlert, type ClaimedAlert } from "../../src/lib/telegram/alerts";
import { sendTelegramMessage, TelegramError, telegramConfig } from "../../src/lib/telegram/api";

const origin = "https://harbor.example";
const userId = "b0000000-0000-4000-8000-000000000001";
const alert = (kind: string, context: unknown): ClaimedAlert => ({
  id: 1,
  kind,
  user_id: userId,
  feedback_id: kind === "feedback" ? "f0000000-0000-4000-8000-000000000001" : null,
  context,
});
const signup = {
  name: "lena",
  username: "lena",
  provider: "google",
  confirmed: true,
  accounts: 1234,
};
const feedback = { name: "Lena Berg", username: "lena", feedback_kind: "bug", page: "/dashboard" };

describe("sign-up alerts", () => {
  it("name the user, how they signed up and link to the account", () => {
    expect(renderAlert(alert("signup", signup), origin)).toBe(
      [
        "<b>New account</b>",
        "@lena signed up with Google.",
        "1,234 accounts in all.",
        `<a href="${origin}/admin/accounts/${userId}">Open the account</a>`,
      ].join("\n"),
    );
  });
  it("say when the email address is not confirmed yet", () => {
    const message = renderAlert(
      alert("signup", { ...signup, name: "Lena Berg", provider: "email", confirmed: false }),
      origin,
    )!;
    expect(message).toContain("Lena Berg (@lena) signed up with email.");
    expect(message).toContain("The email address is not confirmed yet.");
  });
});

describe("feedback alerts", () => {
  it("quote the feedback with its kind, sender and page", () => {
    expect(
      renderAlert(alert("feedback", { ...feedback, message: "The chart is empty" }), origin),
    ).toBe(
      [
        "<b>New feedback: Bug or error</b>",
        "From Lena Berg (@lena) on <code>/dashboard</code>:",
        "<blockquote>The chart is empty</blockquote>",
        `<a href="${origin}/admin/feedback">Open the feedback</a>`,
      ].join("\n"),
    );
  });
  it("escape what users wrote", () => {
    const message = renderAlert(
      alert("feedback", {
        ...feedback,
        name: '<a href="https://evil.example">x</a>',
        message: "Try <b>this</b> & </blockquote><a href='x'>",
      }),
      origin,
    )!;
    expect(message).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;x&lt;/a&gt; (@lena)");
    expect(message).toContain(
      "<blockquote>Try &lt;b&gt;this&lt;/b&gt; &amp; &lt;/blockquote&gt;&lt;a href='x'&gt;</blockquote>",
    );
    expect(message.match(/<a /g)).toHaveLength(1);
  });
  it("leave out a missing page", () =>
    expect(
      renderAlert(alert("feedback", { ...feedback, page: null, message: "Hello there" }), origin),
    ).toContain("From Lena Berg (@lena):"));
});

describe("alerts with nothing to send", () => {
  it.each([
    ["the subject is gone", alert("signup", null)],
    ["the feedback has no text", alert("feedback", { ...feedback, message: "" })],
    ["the kind is unknown", alert("report", signup)],
  ])("are skipped when %s", (_, claimed) => expect(renderAlert(claimed, origin)).toBeNull());
});

describe("the Telegram client", () => {
  const config = { token: "123:secret-token", chatId: "42", base: "https://telegram.test" };
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is off until both the token and the chat are set", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:secret-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "");
    expect(telegramConfig()).toBeNull();
    vi.stubEnv("TELEGRAM_CHAT_ID", " 42 ");
    vi.stubEnv("TELEGRAM_API_BASE", "");
    expect(telegramConfig()).toEqual({
      token: "123:secret-token",
      chatId: "42",
      base: "https://api.telegram.org",
    });
  });

  it("sends HTML to the chat without link previews", async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true, result: {} }));
    vi.stubGlobal("fetch", fetch);
    await sendTelegramMessage(config, "<b>Hi</b>");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://telegram.test/bot123:secret-token/sendMessage");
    expect(JSON.parse(String(init.body))).toEqual({
      chat_id: "42",
      text: "<b>Hi</b>",
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  });

  it("reports Telegram's reason and how long to wait, never the token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            ok: false,
            description: "Too Many Requests: retry after 31",
            parameters: { retry_after: 31 },
          },
          { status: 429 },
        ),
      ),
    );
    const error = await sendTelegramMessage(config, "Hi").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(TelegramError);
    expect((error as TelegramError).message).toBe("Too Many Requests: retry after 31");
    expect((error as TelegramError).retryAfter).toBe(31);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError(`fetch failed for ${config.base}/bot${config.token}/sendMessage`);
      }),
    );
    const offline = await sendTelegramMessage(config, "Hi").catch((cause: unknown) => cause);
    expect((offline as TelegramError).message).toBe("Telegram could not be reached");
    expect((offline as TelegramError).message).not.toContain("secret-token");
  });
});
