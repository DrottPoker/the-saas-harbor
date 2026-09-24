"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { browserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { onMessage, onUnreadChange } from "./live";

/** The header link to Messages, with an unread count that updates live. */
export function MessagesLink({
  userId,
  initialCount,
  className,
}: {
  userId: string;
  initialCount: number;
  className?: string;
}) {
  const [count, setCount] = useState(initialCount);
  const [serverCount, setServerCount] = useState(initialCount);
  // A fresh server render brings a fresh count.
  if (serverCount !== initialCount) {
    setServerCount(initialCount);
    setCount(initialCount);
  }

  useEffect(() => {
    // Counts can arrive out of order; the most recently requested one wins.
    let requested = 0;
    const refresh = async () => {
      const request = ++requested;
      const { data, error } = (await browserClient()?.rpc("unread_message_count")) ?? {};
      if (request === requested && !error && typeof data === "number") setCount(data);
    };
    const stopMessages = onMessage(userId, (event) => {
      if (event.sender_id !== userId) void refresh();
    });
    const stopUnread = onUnreadChange(() => void refresh());
    return () => {
      stopMessages();
      stopUnread();
    };
  }, [userId]);

  return (
    <Link
      href="/messages"
      aria-label={count ? `Messages, ${count} unread` : "Messages"}
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      <MessageSquare aria-hidden="true" className="size-4" />
      <span className="max-md:hidden">Messages</span>
      {count > 0 && (
        <span
          aria-hidden="true"
          className="min-w-5 rounded-full bg-brand px-1.5 text-center text-xs leading-5 font-medium text-primary-foreground tabular-nums"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
