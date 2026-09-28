"use client";

import { useSyncExternalStore } from "react";
import { formatFullTime, formatListTime, formatMessageTime } from "@/lib/messages";

const subscribe = () => () => {};

/**
 * A time in the visitor's own time zone. The server does not know it, so the text is filled in
 * right after hydration instead of rendering the server's time zone.
 */
export function LocalTime({
  value,
  short = false,
  full = false,
  className,
}: {
  value: string;
  /** The day only, unless it is today. */
  short?: boolean;
  /** Always the day, its year and the time. */
  full?: boolean;
  className?: string;
}) {
  const text = useSyncExternalStore(
    subscribe,
    () => (full ? formatFullTime : short ? formatListTime : formatMessageTime)(value),
    () => null,
  );
  return (
    <time dateTime={value} className={className}>
      {text}
    </time>
  );
}
