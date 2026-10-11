"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { formatDay, formatFullTime, formatListTime, formatMessageTime } from "@/lib/time";

/** The server's guess at the visitor's time zone, and the time of the request. */
export type ServerClock = { timeZone: string; now: number };

// The root layout provides the request's clock (`serverClock`).
const ServerClockContext = createContext<ServerClock>({ timeZone: "UTC", now: 0 });

/** Lets the first render in the browser give the same text as the server's HTML. */
export function ServerClockProvider({
  clock,
  children,
}: {
  clock: ServerClock;
  children: React.ReactNode;
}) {
  return <ServerClockContext value={clock}>{children}</ServerClockContext>;
}

const formats: Record<
  "message" | "list" | "full" | "date",
  (value: string, timeZone: string, now?: Date) => string
> = {
  /** The time today, else with the day. */
  message: formatMessageTime,
  /** The time today, else the day only. */
  list: formatListTime,
  /** Always the day, its year and the time. */
  full: formatFullTime,
  /** The day with its year. */
  date: formatDay,
};

const subscribe = () => () => {};

/** The time zone set on the visitor's device. */
function deviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/**
 * A moment in the visitor's own time zone, the one set on their device. The server cannot know it,
 * so it renders the time zone the host looks up from the IP address, and the browser switches to
 * the device's right after hydration when the two differ, as behind a VPN.
 */
export function LocalTime({
  value,
  format = "message",
  className,
}: {
  value: string;
  format?: keyof typeof formats;
  className?: string;
}) {
  const clock = useContext(ServerClockContext);
  const text = useSyncExternalStore(
    subscribe,
    () => formats[format](value, deviceTimeZone()),
    () => formats[format](value, clock.timeZone, new Date(clock.now)),
  );
  return (
    <time dateTime={value} className={className}>
      {text}
    </time>
  );
}
