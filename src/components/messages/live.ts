"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { browserClient } from "@/lib/supabase/browser";

/** Announced for every new message to both participants. Ids only; the text is read under RLS. */
export type MessageEvent = {
  id: string;
  conversation_id: string;
  sender_id: string;
  created_at: string;
};
type Listener = (event: MessageEvent) => void;

const listeners = new Set<Listener>();
const unreadListeners = new Set<() => void>();
let open: { userId: string; channel: RealtimeChannel } | null = null;

function close() {
  if (!open) return;
  void browserClient()?.removeChannel(open.channel);
  open = null;
}

function join(userId: string) {
  close();
  const client = browserClient();
  if (!client) return;
  const channel = client
    .channel(`user:${userId}`, { config: { private: true } })
    .on("broadcast", { event: "message" }, ({ payload }) => {
      for (const listener of listeners) listener(payload as MessageEvent);
    });
  open = { userId, channel };
  // A private channel needs the session token before it joins.
  void client.realtime.setAuth().then(() => {
    if (open?.channel === channel) channel.subscribe();
  });
}

/** Listens for new messages on the maker's private channel, shared by everything in the tab. */
export function onMessage(userId: string, listener: Listener) {
  listeners.add(listener);
  if (open?.userId !== userId) join(userId);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) close();
  };
}

/** Lets the header refresh its unread count after a conversation was read in this tab. */
export function onUnreadChange(listener: () => void) {
  unreadListeners.add(listener);
  return () => {
    unreadListeners.delete(listener);
  };
}

export function notifyUnreadChange() {
  for (const listener of unreadListeners) listener();
}
