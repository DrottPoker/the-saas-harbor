import { describe, expect, it } from "vitest";
import { safeNext } from "../../src/lib/domain";
import {
  formatMessageTime,
  mergeMessages,
  startsGroup,
  type ChatMessage,
} from "../../src/lib/messages";

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

describe("message times", () => {
  // Built in local time, since messages are shown in the visitor's own time zone.
  const now = new Date(2026, 8, 24, 18, 0);
  const format = (date: Date) => formatMessageTime(date.toISOString(), now).replace(/\u202f/g, " ");

  it("shows only the time today", () =>
    expect(format(new Date(2026, 8, 24, 15, 5))).toBe("3:05 PM"));

  it("adds the day this year and the year before that", () => {
    expect(format(new Date(2026, 8, 23, 9, 30))).toBe("Sep 23, 9:30 AM");
    expect(format(new Date(2025, 11, 31, 23, 59))).toBe("Dec 31, 2025, 11:59 PM");
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
