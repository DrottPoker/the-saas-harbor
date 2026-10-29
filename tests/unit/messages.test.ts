import { describe, expect, it } from "vitest";
import { safeNext } from "../../src/lib/domain";
import {
  deliveryStatus,
  laterTime,
  mergeMessages,
  SEND_ERRORS,
  startsGroup,
  type ChatMessage,
} from "../../src/lib/messages";
import en from "../../src/messages/en";
import { userErrorsOf } from "./support/migrations";

const message = (id: string, created_at: string, sender_id = "a"): ChatMessage => ({
  id,
  conversation_id: "c",
  sender_id,
  body: id,
  created_at,
});

describe("message threads", () => {
  it("adds messages once, oldest first", () => {
    const first = message("1", "2026-09-24T10:00:00+00:00");
    const second = message("2", "2026-09-24T10:01:00+00:00");
    const third = message("3", "2026-09-24T10:02:00+00:00");
    expect(mergeMessages([first, third], [second, third]).map((m) => m.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("orders by microseconds within a millisecond, then by id", () => {
    const later = message("a", "2026-09-24T10:00:00.12345+00:00");
    const earlier = message("b", "2026-09-24T10:00:00.1234+00:00");
    const tie = message("c", "2026-09-24T10:00:00.1234+00:00");
    expect(mergeMessages([], [later, tie, earlier]).map((m) => m.id)).toEqual(["b", "c", "a"]);
  });

  it("starts a group for the first message, a new sender or a five-minute gap", () => {
    const start = message("1", "2026-09-24T10:00:00+00:00");
    expect(startsGroup(undefined, start)).toBe(true);
    expect(startsGroup(start, message("2", "2026-09-24T10:04:59+00:00"))).toBe(false);
    expect(startsGroup(start, message("3", "2026-09-24T10:05:01+00:00"))).toBe(true);
    expect(startsGroup(start, message("4", "2026-09-24T10:01:00+00:00", "b"))).toBe(true);
  });
});

describe("read receipts", () => {
  const sent = message("1", "2026-09-24T10:00:00.12345+00:00", "me");
  const reply = message("2", "2026-09-24T10:01:00+00:00", "them");

  it("says Seen once the other maker has read up to the newest message", () => {
    expect(deliveryStatus([sent], "me", null)).toBe("Delivered");
    expect(deliveryStatus([sent], "me", "2026-09-24T10:00:00.1234+00:00")).toBe("Delivered");
    expect(deliveryStatus([sent], "me", sent.created_at)).toBe("Seen");
    expect(deliveryStatus([sent], "me", "2026-09-24T10:05:00+00:00")).toBe("Seen");
  });

  it("says nothing when the newest message is the other maker's, or there is none", () => {
    expect(deliveryStatus([sent, reply], "me", null)).toBeNull();
    expect(deliveryStatus([], "me", null)).toBeNull();
  });

  it("keeps the later read position, to microseconds", () => {
    expect(laterTime(null, null)).toBeNull();
    expect(laterTime(null, sent.created_at)).toBe(sent.created_at);
    expect(laterTime("2026-09-24T10:00:00.1234+00:00", sent.created_at)).toBe(sent.created_at);
    expect(laterTime(reply.created_at, sent.created_at)).toBe(reply.created_at);
  });
});

describe("errors from the database", () => {
  it("has a message for every error send_message() gives users, worded as the database does", () => {
    const raised = userErrorsOf("send_message");
    expect([...SEND_ERRORS.keys()].sort()).toEqual([...new Set(raised)].sort());
    for (const [text, key] of SEND_ERRORS)
      expect(en.messages.errors[key].replace("{max}", "4,000")).toBe(`${text}.`);
  });
});

describe("sign-in continuation", () => {
  it("allows only the messaging pages", () => {
    expect(safeNext("/messages")).toBe("/messages");
    const conversation = "/messages/b0000000-0000-4000-8000-000000000001";
    expect(safeNext(conversation)).toBe(conversation);
    for (const value of [
      undefined,
      "",
      "/dashboard",
      "//evil.example/messages",
      "https://evil.example/messages",
      "/messages/../dashboard",
      "/messages/not-a-uuid",
      `${conversation}?x=1`,
    ])
      expect(safeNext(value)).toBeNull();
  });
});
