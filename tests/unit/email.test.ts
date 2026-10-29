import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../src/i18n/config";
import { authSubjects, authTemplates } from "../../src/lib/email/auth-templates";
import { failureCode, serviceFailure } from "../../src/lib/email/failures";
import { renderEmail, type ClaimedEmail } from "../../src/lib/email/templates";

const settings = { origin: "https://harbor.example", contact: "help@harbor.example" };
const row = (
  kind: string,
  context: unknown,
  name: string | null = "Lena",
  locale: string | null = "en",
): ClaimedEmail => ({
  id: 1,
  kind,
  email: "lena@example.com",
  name,
  context,
  locale,
});
const message = {
  wanted: true,
  sender_id: "b0000000-0000-4000-8000-000000000001",
  sender_name: "Tomás Rivera",
  sender_suspended: false,
  blocked: false,
  unread: 1,
};
const hidden = {
  action: "hide_saas",
  target_label: "Ledgerloop",
  reason: "misleading",
  note: "The revenue claims are false.",
};
const milestone = {
  wanted: true,
  shown: true,
  name: "Tidewise",
  slug: "tidewise",
  provider: "stripe",
  milestones: ["mrr-100", "mrr-500", "mrr-1000", "mrr-2500"],
};
// Intl puts no-break spaces between digits and symbols.
const plain = (value: string) => value.replace(/[\u00a0\u202f]/g, " ");
// Names in right-to-left emails are wrapped in first-strong and pop isolates.
const isolated = (value: string) => `⁨${value}⁩`;

describe("message emails", () => {
  it("say who wrote and link to the conversation, never the message", async () => {
    const email = (await renderEmail(row("message", message), settings))!;
    expect(email.subject).toBe("New message from Tomás Rivera");
    expect(email.text).toContain("Hi Lena,");
    expect(email.text).toContain(
      "Read and reply: https://harbor.example/messages/b0000000-0000-4000-8000-000000000001",
    );
    expect(email.text).toContain("https://harbor.example/dashboard/settings");
    expect(email.html).toContain('href="https://harbor.example/messages/');
  });
  it("leave out message text even if it were in the context", async () => {
    const email = (await renderEmail(
      row("message", { ...message, body: "Secret offer" }),
      settings,
    ))!;
    expect(email.text).not.toContain("Secret offer");
    expect(email.html).not.toContain("Secret offer");
  });
  it("count several unread messages", async () =>
    expect(
      (await renderEmail(row("message", { ...message, unread: 3 }), settings))!.text,
    ).toContain("sent you 3 messages"));
  it.each([
    ["the conversation was read", { unread: 0 }],
    ["the recipient turned message emails off", { wanted: false }],
    ["either maker blocked the other", { blocked: true }],
    ["the sender was suspended", { sender_suspended: true }],
  ])("are skipped when %s", async (_, change) =>
    expect(await renderEmail(row("message", { ...message, ...change }), settings)).toBeNull(),
  );
  it("escape names in HTML and keep subjects on one line", async () => {
    const email = (await renderEmail(
      row("message", { ...message, sender_name: '<img src=x onerror="alert(1)">\nBcc: x' }, null),
      settings,
    ))!;
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.text.startsWith("Hi,")).toBe(true);
  });
});

describe("the email frame", () => {
  it("wraps the content with the logo, a heading and a preview line", async () => {
    const { html } = (await renderEmail(row("message", message), settings))!;
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<a href="https://harbor.example" style=');
    expect(html).toContain('<img src="https://harbor.example/logo.png"');
    expect(html).toContain(">New message from Tomás Rivera</h1>");
    expect(html).toMatch(/display: none[^>]*>Tomás Rivera sent you a message on The SaaS Harbor\./);
    expect(html).toContain(
      "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    );
  });
  it("links the settings in the small print", async () =>
    expect((await renderEmail(row("message", message), settings))!.html).toContain(
      'href="https://harbor.example/dashboard/settings"',
    ));
});

describe("emails in the recipient's language", () => {
  it("uses Japanese wording, fonts and links for Japanese accounts", async () => {
    const email = (await renderEmail(
      row("message", { ...message, unread: 2 }, "花子", "ja"),
      settings,
    ))!;
    expect(email.subject).toBe("Tomás Riveraからの新着メッセージ");
    expect(email.text).toContain("2件のメッセージ");
    expect(email.text).toContain("https://harbor.example/ja/messages/");
    expect(email.html).toContain('<html lang="ja">');
    expect(email.html).toContain("Yu Gothic");
  });
  it("are English for a language the site does not have, or none", async () => {
    for (const locale of ["fr", "", null]) {
      const email = (await renderEmail(row("message", message, "Lena", locale), settings))!;
      expect(email.subject).toBe("New message from Tomás Rivera");
    }
  });
  it("write Arabic right to left, with names isolated and links to the Arabic pages", async () => {
    const email = (await renderEmail(
      row("message", { ...message, unread: 2 }, "Lena", "ar"),
      settings,
    ))!;
    expect(email.subject).toBe(`رسالة جديدة من ${isolated("Tomás Rivera")}`);
    expect(email.text).toContain(`مرحبًا ${isolated("Lena")}،`);
    expect(email.text).toContain(`لديك رسالتان جديدتان من ${isolated("Tomás Rivera")}`);
    expect(email.text).toContain(
      "اقرأ وردّ: https://harbor.example/ar/messages/b0000000-0000-4000-8000-000000000001",
    );
    expect(email.text).toContain("https://harbor.example/ar/dashboard/settings");
    expect(email.html).toContain('<html lang="ar" dir="rtl">');
    expect(email.html).toContain('<table role="presentation" dir="rtl"');
    expect(email.html).toContain('<a href="https://harbor.example/ar" style=');
    expect(email.html).toContain("padding-right: 8px");
    expect(email.html).toContain("'Noto Sans Arabic'");
  });
  it("use Western digits and Arabic plural forms", async () => {
    const email = (await renderEmail(
      row("reports", { wanted: true, open: 11 }, "Sam", "ar"),
      settings,
    ))!;
    expect(email.subject).toBe("11 بلاغًا مفتوحًا على The SaaS Harbor");
    // The admin panel has one address, in English.
    expect(email.text).toContain("https://harbor.example/admin/reports");
  });
  it("give Arabic decisions the reason in Arabic and the explanation as written", async () => {
    const email = (await renderEmail(row("decision", hidden, "Lena", "ar"), settings))!;
    expect(email.subject).toBe(`أخفى مشرف منتجك ${isolated("Ledgerloop")}`);
    expect(email.text).toContain("السبب: معلومات مضللة أو كاذبة");
    expect(email.text).toContain(`التوضيح:\n${isolated("The revenue claims are false.")}`);
    expect(email.text).toContain(isolated("help@harbor.example"));
    expect(email.text).toContain("https://harbor.example/ar/terms#moderation");
  });
  it("count Russian messages with the right plural forms", async () => {
    const russian = async (unread: number) =>
      (await renderEmail(row("message", { ...message, unread }, "Lena", "ru"), settings))!.text;
    expect(await russian(1)).toContain("У вас новое сообщение от Tomás Rivera на The SaaS Harbor.");
    expect(await russian(3)).toContain("У вас 3 новых сообщения");
    expect(await russian(5)).toContain("У вас 5 новых сообщений");
    expect(await russian(21)).toContain("У вас 21 новое сообщение");
  });
  it("write Spanish milestones in US dollars the Spanish way, linking the Spanish page", async () => {
    const email = (await renderEmail(row("milestone", milestone, "Lena", "es"), settings))!;
    const page = "https://harbor.example/es/saas/tidewise/milestones/mrr-2500";
    expect(plain(email.subject)).toBe("Tidewise alcanzó USD 2.5 K de MRR");
    expect(plain(email.text)).toContain(
      "Tidewise alcanzó USD 2,500 en ingresos recurrentes mensuales. Los ingresos están verificados a través de Stripe.",
    );
    expect(email.text).toContain(`Abrir la página del hito: ${page}`);
    const share = new URL(email.text.match(/Compartir en X: (\S+)/)![1]);
    expect(plain(share.searchParams.get("text")!)).toBe(
      "Tidewise acaba de alcanzar USD 2.5 K de MRR, verificado en The SaaS Harbor.",
    );
    expect(share.searchParams.get("url")).toBe(page);
    // Sharing images are the same in every language.
    expect(email.html).toContain(
      '<img src="https://harbor.example/saas/tidewise/milestones/mrr-2500/opengraph-image"',
    );
    expect(email.html).toContain('<html lang="es">');
  });
  it("join Chinese sentences without spaces and name the place", async () => {
    const email = (await renderEmail(
      row("milestone", { ...milestone, milestones: ["top-10", "top-3", "mrr-5000"] }, "李", "zh"),
      settings,
    ))!;
    expect(email.subject).toBe("Tidewise 进入了前 3 名");
    expect(email.text).toContain("李，你好：");
    expect(email.text).toContain(
      "排行榜的前 3 名。它的 MRR 也达到了 US$5000。收入已通过 Stripe 验证。",
    );
    expect(email.html).toContain('<html lang="zh-Hans">');
    expect(email.html).toContain("'Microsoft YaHei'");
  });
  it("show Devanagari fonts for Hindi", async () => {
    const email = (await renderEmail(
      row("outcome", { status: "dismissed", target: "saas", name: "Ledgerloop" }, "Lena", "hi"),
      settings,
    ))!;
    expect(email.subject).toBe("आपकी रिपोर्ट की समीक्षा हो गई है");
    expect(email.text).toContain("उत्पाद Ledgerloop के बारे में");
    expect(email.text).toContain("https://harbor.example/hi/dashboard/reports");
    expect(email.html).toContain("'Nirmala UI'");
  });
  const every: [string, unknown][] = [
    ["message", message],
    ["reports", { wanted: true, open: 2 }],
    ["decision", hidden],
    ["decision", { ...hidden, action: "restore_saas" }],
    ["decision", { ...hidden, action: "suspend_account" }],
    ["decision", { action: "restore_account" }],
    ["milestone", milestone],
    ["milestone", { ...milestone, milestones: ["top-1", "mrr-1000000"] }],
    ["outcome", { status: "actioned", target: "message", name: null }],
    ["outcome", { status: "dismissed", target: "profile", name: "Sam" }],
  ];
  it.each(LOCALES.filter((locale) => locale !== "en"))(
    "cover every email in %s without English or message keys",
    async (locale) => {
      for (const [kind, context] of every) {
        const english = (await renderEmail(row(kind, context), settings))!;
        const email = (await renderEmail(row(kind, context, "Lena", locale), settings))!;
        expect(email.subject, kind).not.toBe(english.subject);
        expect(email.text, kind).not.toContain(english.text.split("\n\n")[1]);
        expect(email.text, kind).not.toMatch(/\b(?:emails|milestone|decision|outcome)\.[a-z]/);
        expect(email.text, kind).not.toContain("—");
      }
    },
  );
});

describe("auth emails", () => {
  it.each(Object.entries(authTemplates))(
    "match supabase/templates/%s.html",
    async (name, template) =>
      await expect(template).toMatchFileSnapshot(`../../supabase/templates/${name}.html`),
  );
  it("link to the confirm page with the token and the site's logo", () => {
    expect(authTemplates.confirmation).toContain(
      'href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email"',
    );
    expect(authTemplates.recovery).toContain("&amp;type=recovery");
    expect(authTemplates.recovery).toContain('<img src="{{ .SiteURL }}/logo.png"');
    expect(authTemplates.email_change).toContain("&amp;type=email_change");
    expect(authTemplates.email_change).toContain("to {{ .NewEmail }}");
  });
  it("hold every language, English for any other value of the user's locale", () => {
    for (const template of [...Object.values(authTemplates), ...Object.values(authSubjects)]) {
      for (const locale of LOCALES.filter((value) => value !== "en"))
        expect(template).toContain(`eq (printf "%v" .Data.locale) "${locale}" }}`);
      expect(template).toMatch(/\{\{-? else \}\}[^{]*(Confirm|Reset)/);
      // Never `eq .Data.locale`, which fails on a number and stops the email.
      expect(template).not.toMatch(/eq \.Data/);
    }
    expect(authTemplates.confirmation).toContain('<html lang="ar" dir="rtl">');
    expect(authTemplates.confirmation).toContain('<a href="{{ .SiteURL }}/ar" style=');
    expect(authTemplates.confirmation).toContain('<html lang="en">');
    expect(authTemplates.email_change).toContain("من ⁨{{ .Email }}⁩ إلى ⁨{{ .NewEmail }}⁩");
  });
  it("set the localized subjects in supabase/config.toml", () => {
    const config = readFileSync(join(__dirname, "../../supabase/config.toml"), "utf8").replace(
      /\r\n/g,
      "\n",
    );
    for (const [name, subject] of Object.entries(authSubjects)) {
      // TOML literal strings cannot hold a single quote, and a subject is one line.
      expect(subject).not.toMatch(/['\n]/);
      expect(config).toContain(`[auth.email.template.${name}]\nsubject = '${subject}'\n`);
    }
    expect(authSubjects.confirmation).toMatch(
      /\{\{ else \}\}Confirm your email for The SaaS Harbor\{\{ end \}\}$/,
    );
  });
});

describe("report emails for admins", () => {
  it("count the open reports and link to the queue", async () => {
    const email = (await renderEmail(row("reports", { wanted: true, open: 3 }), settings))!;
    expect(email.subject).toBe("3 open reports on The SaaS Harbor");
    expect(email.text).toContain("https://harbor.example/admin/reports");
  });
  it("are skipped when nothing is open or the admin opted out", async () => {
    expect(await renderEmail(row("reports", { wanted: true, open: 0 }), settings)).toBeNull();
    expect(await renderEmail(row("reports", { wanted: false, open: 2 }), settings)).toBeNull();
  });
});

describe("decision emails", () => {
  it("give the reason, the explanation and how to disagree", async () => {
    const email = (await renderEmail(row("decision", hidden), settings))!;
    expect(email.subject).toBe("An admin hid your product Ledgerloop");
    expect(email.text).toContain("Reason: Misleading or false information");
    expect(email.text).toContain("Explanation:\nThe revenue claims are false.");
    expect(email.text).toContain("write to help@harbor.example");
  });
  it("name no address while none is set", async () => {
    const text = (await renderEmail(row("decision", hidden), { ...settings, contact: null }))!.text;
    expect(text).toContain("A person made this decision, not an automated system.");
    expect(text).not.toContain("write to");
  });
  it("cover suspensions and both reversals", async () => {
    expect(
      (await renderEmail(row("decision", { ...hidden, action: "suspend_account" }), settings))!
        .subject,
    ).toBe("Your account on The SaaS Harbor is suspended");
    expect(
      (await renderEmail(
        row("decision", { action: "restore_saas", target_label: "Ledgerloop" }),
        settings,
      ))!.subject,
    ).toBe("Your product Ledgerloop is shown again");
    expect(
      (await renderEmail(row("decision", { action: "restore_account" }), settings))!.subject,
    ).toBe("Your account on The SaaS Harbor is active again");
    expect(await renderEmail(row("decision", { action: "dismiss_report" }), settings)).toBeNull();
  });
  it("escape explanations in HTML", async () =>
    expect(
      (await renderEmail(row("decision", { ...hidden, note: "<b>bold</b>" }), settings))!.html,
    ).toContain("&lt;b&gt;bold&lt;/b&gt;"));
});

describe("outcome emails", () => {
  it("tell the reporter whether action was taken", async () => {
    const actioned = (await renderEmail(
      row("outcome", { status: "actioned", target: "saas", name: "Ledgerloop" }),
      settings,
    ))!;
    expect(actioned.subject).toBe("Your report has been reviewed");
    expect(actioned.text).toContain("your report about the product Ledgerloop");
    expect(actioned.text).toContain("They took action");
    const dismissed = (await renderEmail(
      row("outcome", { status: "dismissed", target: "profile", name: "Sam" }),
      settings,
    ))!;
    expect(dismissed.text).toContain("the profile of Sam");
    expect(dismissed.text).toContain("took no action");
  });
  it("never quote a reported message", async () =>
    expect(
      (await renderEmail(
        row("outcome", { status: "actioned", target: "message", name: null }),
        settings,
      ))!.text,
    ).toContain("about a message you received."));
  it("are skipped for a report that is gone or still open", async () => {
    expect(await renderEmail(row("outcome", null), settings)).toBeNull();
    expect(
      await renderEmail(row("outcome", { status: "open", target: "saas" }), settings),
    ).toBeNull();
  });
});

describe("milestone emails", () => {
  const page = "https://harbor.example/saas/tidewise/milestones/mrr-2500";
  it("lead with the highest threshold and link to its page and card", async () => {
    const email = (await renderEmail(row("milestone", milestone), settings))!;
    expect(email.subject).toBe("Tidewise reached $2.5K MRR");
    expect(email.text).toContain(
      "Tidewise reached $2,500 in monthly recurring revenue. The revenue is verified through Stripe.",
    );
    expect(email.text).toContain(`Open the milestone page: ${page}`);
    expect(email.text).toContain(
      `Share on X: https://x.com/intent/post?text=Tidewise+just+reached+%242.5K+MRR%2C+verified+on+The+SaaS+Harbor.&url=${encodeURIComponent(page)}`,
    );
    expect(email.text).toContain(
      `Share on LinkedIn: https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(page)}`,
    );
    expect(email.html).toContain(`<img src="${page}/opengraph-image"`);
    expect(email.html).toContain('alt="Tidewise: $2.5K MRR on The SaaS Harbor"');
    expect(email.text).toContain("https://harbor.example/dashboard/settings");
  });
  it("lead with a place and name the threshold reached with it", async () => {
    const email = (await renderEmail(
      row("milestone", { ...milestone, milestones: ["top-10", "top-3", "mrr-5000"] }),
      settings,
    ))!;
    expect(email.subject).toBe("Tidewise reached the top 3");
    expect(email.text).toContain("It also reached $5K MRR.");
    expect(email.text).toContain("/saas/tidewise/milestones/top-3");
    expect(email.text).toContain(
      "text=Tidewise+is+now+in+the+top+3+on+The+SaaS+Harbor%27s+leaderboard+of+verified+revenue.",
    );
  });
  it("name first place", async () => {
    const email = (await renderEmail(
      row("milestone", { ...milestone, milestones: ["top-1", "mrr-10000"] }),
      settings,
    ))!;
    expect(email.subject).toBe("Tidewise reached first place");
    expect(email.text).toContain(
      "Tidewise reached first place on the leaderboard of verified revenue on The SaaS Harbor. It also reached $10K MRR.",
    );
    expect(email.html).toContain('alt="Tidewise: #1 on The SaaS Harbor"');
  });
  it("are skipped when the MRR is no longer shown, the founder opted out or nothing is known", async () => {
    expect(
      await renderEmail(row("milestone", { ...milestone, shown: false }), settings),
    ).toBeNull();
    expect(
      await renderEmail(row("milestone", { ...milestone, wanted: false }), settings),
    ).toBeNull();
    expect(
      await renderEmail(row("milestone", { ...milestone, milestones: ["mrr-3"] }), settings),
    ).toBeNull();
    expect(await renderEmail(row("milestone", null), settings)).toBeNull();
  });
  it("escape product names in HTML", async () =>
    expect(
      (await renderEmail(row("milestone", { ...milestone, name: "<b>Tide</b>" }), settings))!.html,
    ).not.toContain("<b>Tide</b>"));
});

describe("sending failures", () => {
  const failure = (props: Record<string, unknown>) => Object.assign(new Error("failed"), props);

  it("put the email back when the server cannot be reached, refuses the login or asks to wait", () => {
    for (const code of [
      "ECONNECTION",
      "ETIMEDOUT",
      "ESOCKET",
      "EAUTH",
      "ECONNREFUSED",
      "EAI_AGAIN",
    ])
      expect(serviceFailure(failure({ code })), code).toBe(true);
    expect(serviceFailure(failure({ code: "EENVELOPE", responseCode: 451 }))).toBe(true);
    expect(serviceFailure(failure({ responseCode: 421 }))).toBe(true);
  });

  it("count against the email when the server refuses it", () => {
    expect(serviceFailure(failure({ code: "EENVELOPE", responseCode: 550 }))).toBe(false);
    expect(serviceFailure(failure({ code: "EMESSAGE" }))).toBe(false);
    expect(serviceFailure(new Error("failed"))).toBe(false);
    expect(serviceFailure(null)).toBe(false);
  });

  it("are logged by their codes only, never a message that may hold an address", () => {
    expect(failureCode(failure({ code: "EAUTH", responseCode: 535 }))).toBe("EAUTH 535");
    expect(failureCode(failure({ code: "lena@example.com" }))).toBe("unknown");
    expect(failureCode("lena@example.com")).toBe("unknown");
  });
});
