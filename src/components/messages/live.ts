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
/** Announced to the other participant when a maker reads further in a conversation. */
export type ReadEvent = { conversation_id: string; read_at: string };

const listeners = new Set<(event: MessageEvent) => void>();
const readListeners = new Set<(event: ReadEvent) => void>();
const unreadListeners = new Set<() => void>();
const joinListeners = new Set<() => void>();
let open: { userId: string; channel: RealtimeChannel; joined: boolean } | null = null;

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
    })
    .on("broadcast", { event: "read" }, ({ payload }) => {
      for (const listener of readListeners) listener(payload as ReadEvent);
    });
  const current = { userId, channel, joined: false };
  open = current;
  // Events sent before a join were missed, so the open conversation catches up, and after the
  // connection dropped the header counts again too.
  const subscribed = (status: string) => {
    if (status !== "SUBSCRIBED") return;
    const again = current.joined;
    current.joined = true;
    for (const listener of joinListeners) listener();
    if (again) for (const listener of unreadListeners) listener();
  };
  // A private channel needs the session token before it joins.
  void client.realtime.setAuth().then(() => {
    if (open?.channel === channel) channel.subscribe(subscribed);
  });
}

function listen<T>(set: Set<T>, userId: string, listener: T) {
  set.add(listener);
  if (open?.userId !== userId) join(userId);
  return () => {
    set.delete(listener);
    if (!listeners.size && !readListeners.size) close();
  };
}

/** Listens for new messages on the maker's private channel, shared by everything in the tab. */
export function onMessage(userId: string, listener: (event: MessageEvent) => void) {
  return listen(listeners, userId, listener);
}

/** Listens for the other maker reading further in a conversation, on the same channel. */
export function onRead(userId: string, listener: (event: ReadEvent) => void) {
  return listen(readListeners, userId, listener);
}

/** Lets the header refresh its unread count after a conversation was read in this tab. */
export function onUnreadChange(listener: () => void) {
  unreadListeners.add(listener);
  return () => {
    unreadListeners.delete(listener);
  };
}

/**
 * Runs once the channel has joined, at once when it already has, and again whenever it joins
 * again after the connection dropped: events sent before a join were missed.
 */
export function onJoin(listener: () => void) {
  joinListeners.add(listener);
  if (open?.joined) listener();
  return () => {
    joinListeners.delete(listener);
  };
}

export function notifyUnreadChange() {
  for (const listener of unreadListeners) listener();
}
