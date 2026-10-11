// Dates and times in a given time zone, for the server and the browser alike. Pure functions only.
// Pages show moments in the visitor's own time zone through `LocalTime`.

/** A time zone the runtime knows, such as America/New_York. */
export function isTimeZone(value: string) {
  if (!value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The time zone the host looks up from the visitor's IP address (Vercel's x-vercel-ip-timezone),
 * or UTC without one. Only a first guess: the browser replaces it with the device's own.
 */
export function ipTimeZone(value: string | null) {
  return value && isTimeZone(value) ? value : "UTC";
}

function format(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(date);
}

const time = (date: Date, timeZone: string) =>
  format(date, timeZone, { hour: "numeric", minute: "2-digit" });

const sameDay = (a: Date, b: Date, timeZone: string) => {
  const options = { year: "numeric", month: "numeric", day: "numeric" } as const;
  return format(a, timeZone, options) === format(b, timeZone, options);
};

/** "Sep 24" this year, "Sep 24, 2025" before. */
function shortDay(date: Date, timeZone: string, now: Date) {
  const year = (value: Date) => format(value, timeZone, { year: "numeric" });
  return format(date, timeZone, {
    month: "short",
    day: "numeric",
    ...(year(date) === year(now) ? {} : { year: "numeric" }),
  });
}

/** "3:05 PM" today, "Sep 24, 3:05 PM" this year, "Sep 24, 2025, 3:05 PM" before. */
export function formatMessageTime(value: string, timeZone: string, now = new Date()) {
  const date = new Date(value);
  if (sameDay(date, now, timeZone)) return time(date, timeZone);
  return `${shortDay(date, timeZone, now)}, ${time(date, timeZone)}`;
}

/** The shorter form for the conversation list: "3:05 PM" today, else the day only. */
export function formatListTime(value: string, timeZone: string, now = new Date()) {
  const date = new Date(value);
  return sameDay(date, now, timeZone) ? time(date, timeZone) : shortDay(date, timeZone, now);
}

/** The day, with its year, and the time: "Sep 24, 2026, 3:05 PM". */
export function formatFullTime(value: string, timeZone: string) {
  return format(new Date(value), timeZone, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The day with its year: "Sep 24, 2026". */
export function formatDay(value: string, timeZone: string) {
  return format(new Date(value), timeZone, { month: "short", day: "numeric", year: "numeric" });
}
