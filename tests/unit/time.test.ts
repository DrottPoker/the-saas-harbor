import { describe, expect, it } from "vitest";
import { formatDate } from "../../src/lib/domain";
import {
  formatDay,
  formatFullTime,
  formatListTime,
  formatMessageTime,
  ipTimeZone,
  isTimeZone,
} from "../../src/lib/time";

// Intl puts a narrow no-break space before AM and PM.
const plain = (text: string) => text.replace(/\u202f/g, " ");

describe("time zones", () => {
  it("accepts only time zones the runtime knows", () => {
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone("America/New_York")).toBe(true);
    expect(isTimeZone("")).toBe(false);
    expect(isTimeZone("Nowhere/Nothing")).toBe(false);
  });

  it("takes the host's guess from the IP address, else UTC", () => {
    expect(ipTimeZone("Europe/Stockholm")).toBe("Europe/Stockholm");
    expect(ipTimeZone(null)).toBe("UTC");
    expect(ipTimeZone("")).toBe("UTC");
    expect(ipTimeZone("Nowhere/Nothing")).toBe("UTC");
  });
});

describe("message times", () => {
  // 4:00 PM in New York, 10:00 PM in Stockholm.
  const now = new Date("2026-09-24T20:00:00Z");
  const message = (value: string, zone = "America/New_York") =>
    plain(formatMessageTime(value, zone, now));

  it("shows only the time today", () => expect(message("2026-09-24T19:05:00Z")).toBe("3:05 PM"));

  it("adds the day this year and the year before that", () => {
    expect(message("2026-09-23T13:30:00Z")).toBe("Sep 23, 9:30 AM");
    expect(message("2026-01-01T04:59:00Z")).toBe("Dec 31, 2025, 11:59 PM");
  });

  it("decides today and the year in the time zone given", () => {
    expect(message("2026-09-24T23:30:00Z")).toBe("7:30 PM");
    expect(message("2026-09-24T23:30:00Z", "Europe/Stockholm")).toBe("Sep 25, 1:30 AM");
    expect(message("2026-01-01T04:59:00Z", "Europe/Stockholm")).toBe("Jan 1, 5:59 AM");
  });

  it("always gives the day, its year and the time in full", () => {
    expect(plain(formatFullTime("2026-09-24T19:05:00Z", "America/New_York"))).toBe(
      "Sep 24, 2026, 3:05 PM",
    );
    expect(plain(formatFullTime("2026-09-24T19:05:00Z", "Asia/Tokyo"))).toBe(
      "Sep 25, 2026, 4:05 AM",
    );
  });

  it("shows the time today and only the day before that in the conversation list", () => {
    const short = (value: string) => plain(formatListTime(value, "America/New_York", now));
    expect(short("2026-09-24T19:05:00Z")).toBe("3:05 PM");
    expect(short("2026-09-23T13:30:00Z")).toBe("Sep 23");
    expect(short("2026-01-01T04:59:00Z")).toBe("Dec 31, 2025");
  });
});

describe("days", () => {
  it("gives the day of a moment in the time zone given", () => {
    expect(formatDay("2026-09-24T23:30:00Z", "UTC")).toBe("Sep 24, 2026");
    expect(formatDay("2026-09-24T23:30:00Z", "Europe/Stockholm")).toBe("Sep 25, 2026");
    expect(formatDay("2026-09-24T03:30:00Z", "America/Los_Angeles")).toBe("Sep 23, 2026");
  });

  it("keeps calendar dates as they are, and says Not shared without one", () => {
    expect(formatDate("2026-10-01")).toBe("Oct 1, 2026");
    expect(formatDate("2026-09-24T23:30:00Z")).toBe("Sep 24, 2026");
    expect(formatDate(null)).toBe("Not shared");
  });
});
