"use client";

import { useSyncExternalStore } from "react";
import { formatMessageTime } from "@/lib/messages";

const subscribe = () => () => {};

/**
 * A time in the visitor's own time zone. The server does not know it, so the text is filled in
 * right after hydration instead of rendering the server's time zone.
 */
export function LocalTime({ value, className }: { value: string; className?: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => formatMessageTime(value),
    () => null,
  );
  return (
    <time dateTime={value} className={className}>
      {text}
    </time>
  );
}
