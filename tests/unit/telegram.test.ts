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
  it("name a visitor without an account, and only say whether they left an address", () => {
    const visitor = {
      ...alert("feedback", {
        visitor: true,
        reply: true,
        feedback_kind: "other",
        message: "Sign-up keeps saying my email is wrong",
        page: "/auth",
      }),
      user_id: null,
    };
    expect(renderAlert(visitor, origin)).toBe(
      [
        "<b>New feedback: Other feedback</b>",
        "From a visitor on <code>/auth</code>:",
        "<blockquote>Sign-up keeps saying my email is wrong</blockquote>",
        "They left an email address for a reply.",
        `<a href="${origin}/admin/feedback">Open the feedback</a>`,
      ].join("\n"),
    );
    expect(
      renderAlert(
        { ...visitor, context: { ...(visitor.context as object), reply: false } },
        origin,
      ),
    ).not.toContain("email address");
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

const product = {
  name: "Lena Berg",
  username: "lena",
  product: "Querybird",
  tagline: "SQL answers <fast>",
  category: "Developer Tools",
  slug: "querybird",
  hidden: false,
};
const report = {
  name: "Tomás Rivera",
  username: "tomas",
  report_id: "d0000000-0000-4000-8000-000000000001",
  target: "saas",
  target_name: "Querybird",
  subject_name: "Lena Berg",
  reason: "spam",
  details: "",
  open_reports: 3,
};
const message = {
  name: "Tomás Rivera",
  username: "tomas",
  sender_id: "c0000000-0000-4000-8000-000000000001",
  sender_suspended: false,
  wanted: true,
  blocked: false,
};

describe("product alerts", () => {
  it("name the product, its founder and category, and link to its page", () =>
    expect(renderAlert(alert("saas", product), origin)).toBe(
      [
        "<b>New product</b>",
        "Querybird by Lena Berg (@lena), in Developer Tools.",
        "<blockquote>SQL answers &lt;fast&gt;</blockquote>",
        `<a href="${origin}/saas/querybird">Open the product</a>`,
      ].join("\n"),
    ));
});

describe("report alerts", () => {
  it("say who reported what and why, and link to the report", () =>
    expect(renderAlert(alert("report", report), origin)).toBe(
      [
        "<b>New report</b>",
        "Tomás Rivera (@tomas) reported the product Querybird: Spam or advertising.",
        "3 open reports.",
        `<a href="${origin}/admin/reports/${report.report_id}">Open the report</a>`,
      ].join("\n"),
    ));
  it("quote the reporter's explanation, and name whose profile or message it is", () => {
    const profile = renderAlert(
      alert("report", { ...report, target: "profile", reason: "other", details: "Fake <b>" }),
      origin,
    )!;
    expect(profile).toContain("reported the profile of Lena Berg: Something else.");
    expect(profile).toContain("<blockquote>Fake &lt;b&gt;</blockquote>");
    const reported = renderAlert(
      alert("report", { ...report, target: "message", open_reports: 1 }),
      origin,
    )!;
    expect(reported).toContain("reported a message from Lena Berg: Spam or advertising.");
    expect(reported).toContain("1 open report.");
  });
});

describe("message alerts", () => {
  it("name the sender and link to the conversation, never the message", () =>
    expect(renderAlert(alert("message", { ...message, body: "Secret offer" }), origin)).toBe(
      [
        "<b>New message</b>",
        "Tomás Rivera (@tomas) wrote to you.",
        `<a href="${origin}/messages/${message.sender_id}">Read and reply</a>`,
      ].join("\n"),
    ));
});

describe("alerts with nothing to send", () => {
  it.each([
    ["the subject is gone", alert("signup", null)],
    ["the feedback has no text", alert("feedback", { ...feedback, message: "" })],
    ["the product was hidden", alert("saas", { ...product, hidden: true })],
    ["the account no longer wants message alerts", alert("message", { ...message, wanted: false })],
    ["either user blocked the other", alert("message", { ...message, blocked: true })],
    ["the sender was suspended", alert("message", { ...message, sender_suspended: true })],
    ["the kind is unknown", alert("invoice", signup)],
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

  it("tells failures of Telegram or the setup from failures of one alert", async () => {
    const answer = (status: number, description: string) =>
      vi.fn(async () => Response.json({ ok: false, description }, { status }));
    const service = async (fetch: ReturnType<typeof answer>) => {
      vi.stubGlobal("fetch", fetch);
      return ((await sendTelegramMessage(config, "Hi").catch((cause) => cause)) as TelegramError)
        .service;
    };
    expect(await service(answer(429, "Too Many Requests: retry after 31"))).toBe(true);
    expect(await service(answer(502, "Bad Gateway"))).toBe(true);
    expect(await service(answer(401, "Unauthorized"))).toBe(true);
    expect(await service(answer(403, "Forbidden: bot was blocked by the user"))).toBe(true);
    expect(await service(answer(400, "Bad Request: chat not found"))).toBe(true);
    expect(await service(answer(400, "Bad Request: can't parse entities"))).toBe(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(
      ((await sendTelegramMessage(config, "Hi").catch((cause) => cause)) as TelegramError).service,
    ).toBe(true);
  });
});
