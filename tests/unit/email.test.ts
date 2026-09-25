import { describe, expect, it } from "vitest";
import { renderEmail, type ClaimedEmail } from "../../src/lib/email/templates";

const settings = { origin: "https://harbor.example", contact: "help@harbor.example" };
const row = (kind: string, context: unknown, name: string | null = "Lena"): ClaimedEmail => ({
  id: 1,
  kind,
  email: "lena@example.com",
  name,
  context,
});
const message = {
  wanted: true,
  sender_id: "b0000000-0000-4000-8000-000000000001",
  sender_name: "Tomás Rivera",
  sender_suspended: false,
  blocked: false,
  unread: 1,
};

describe("message emails", () => {
  it("say who wrote and link to the conversation, never the message", () => {
    const email = renderEmail(row("message", message), settings)!;
    expect(email.subject).toBe("New message from Tomás Rivera");
    expect(email.text).toContain("Hi Lena,");
    expect(email.text).toContain(
      "Read and reply: https://harbor.example/messages/b0000000-0000-4000-8000-000000000001",
    );
    expect(email.text).toContain("https://harbor.example/dashboard/settings");
    expect(email.html).toContain('href="https://harbor.example/messages/');
  });
  it("leave out message text even if it were in the context", () => {
    const email = renderEmail(row("message", { ...message, body: "Secret offer" }), settings)!;
    expect(email.text).not.toContain("Secret offer");
    expect(email.html).not.toContain("Secret offer");
  });
  it("count several unread messages", () =>
    expect(renderEmail(row("message", { ...message, unread: 3 }), settings)!.text).toContain(
      "sent you 3 messages",
    ));
  it.each([
    ["the conversation was read", { unread: 0 }],
    ["the recipient turned message emails off", { wanted: false }],
    ["either maker blocked the other", { blocked: true }],
    ["the sender was suspended", { sender_suspended: true }],
  ])("are skipped when %s", (_, change) =>
    expect(renderEmail(row("message", { ...message, ...change }), settings)).toBeNull(),
  );
  it("escape names in HTML and keep subjects on one line", () => {
    const email = renderEmail(
      row("message", { ...message, sender_name: '<img src=x onerror="alert(1)">\nBcc: x' }, null),
      settings,
    )!;
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.text.startsWith("Hi,")).toBe(true);
  });
});

describe("report emails for admins", () => {
  it("count the open reports and link to the queue", () => {
    const email = renderEmail(row("reports", { wanted: true, open: 3 }), settings)!;
    expect(email.subject).toBe("3 open reports on The SaaS Harbor");
    expect(email.text).toContain("https://harbor.example/admin/reports");
  });
  it("are skipped when nothing is open or the admin opted out", () => {
    expect(renderEmail(row("reports", { wanted: true, open: 0 }), settings)).toBeNull();
    expect(renderEmail(row("reports", { wanted: false, open: 2 }), settings)).toBeNull();
  });
});

describe("decision emails", () => {
  const hidden = {
    action: "hide_saas",
    target_label: "Ledgerloop",
    reason: "misleading",
    note: "The revenue claims are false.",
  };
  it("give the reason, the explanation and how to disagree", () => {
    const email = renderEmail(row("decision", hidden), settings)!;
    expect(email.subject).toBe("An admin hid your product Ledgerloop");
    expect(email.text).toContain("Reason: Misleading or false information");
    expect(email.text).toContain("Explanation:\nThe revenue claims are false.");
    expect(email.text).toContain("write to help@harbor.example");
  });
  it("point to the terms while no contact address is published", () =>
    expect(renderEmail(row("decision", hidden), { ...settings, contact: null })!.text).toContain(
      "The terms explain how to disagree",
    ));
  it("cover suspensions and both reversals", () => {
    expect(
      renderEmail(row("decision", { ...hidden, action: "suspend_account" }), settings)!.subject,
    ).toBe("Your account on The SaaS Harbor is suspended");
    expect(
      renderEmail(
        row("decision", { action: "restore_saas", target_label: "Ledgerloop" }),
        settings,
      )!.subject,
    ).toBe("Your product Ledgerloop is shown again");
    expect(renderEmail(row("decision", { action: "restore_account" }), settings)!.subject).toBe(
      "Your account on The SaaS Harbor is active again",
    );
    expect(renderEmail(row("decision", { action: "dismiss_report" }), settings)).toBeNull();
  });
  it("escape explanations in HTML", () =>
    expect(
      renderEmail(row("decision", { ...hidden, note: "<b>bold</b>" }), settings)!.html,
    ).toContain("&lt;b&gt;bold&lt;/b&gt;"));
});

describe("outcome emails", () => {
  it("tell the reporter whether action was taken", () => {
    const actioned = renderEmail(
      row("outcome", { status: "actioned", target: "saas", name: "Ledgerloop" }),
      settings,
    )!;
    expect(actioned.subject).toBe("Your report has been reviewed");
    expect(actioned.text).toContain("your report about the product Ledgerloop");
    expect(actioned.text).toContain("They took action");
    const dismissed = renderEmail(
      row("outcome", { status: "dismissed", target: "profile", name: "Sam" }),
      settings,
    )!;
    expect(dismissed.text).toContain("the profile of Sam");
    expect(dismissed.text).toContain("took no action");
  });
  it("never quote a reported message", () =>
    expect(
      renderEmail(row("outcome", { status: "actioned", target: "message", name: null }), settings)!
        .text,
    ).toContain("about a message you received."));
  it("are skipped for a report that is gone or still open", () => {
    expect(renderEmail(row("outcome", null), settings)).toBeNull();
    expect(renderEmail(row("outcome", { status: "open", target: "saas" }), settings)).toBeNull();
  });
});
