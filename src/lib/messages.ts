// Shared by the conversation view on the server and in the browser. Pure functions only.
import type { ActionState } from "./domain";
import type { Database } from "./supabase/database.types";

export type ChatMessage = Pick<
  Database["public"]["Tables"]["messages"]["Row"],
  "id" | "conversation_id" | "sender_id" | "body" | "created_at"
>;

export type SendState = ActionState & { message?: ChatMessage };

export const MESSAGE_COLUMNS = "id, conversation_id, sender_id, body, created_at";
export const MESSAGE_PAGE_SIZE = 50;

/** One row of the conversation list, from the view `inbox`. */
export type InboxConversation = Database["public"]["Views"]["inbox"]["Row"];
export const INBOX_COLUMNS =
  "id, other_id, other_name, other_avatar_path, last_message_at, last_body, last_sender_id, unread, blocked";

const text = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);

/**
 * Orders two timestamps from the database, which are ISO strings in UTC. Microseconds decide
 * within the same millisecond.
 */
export function compareTimes(a: string, b: string) {
  return Date.parse(a) - Date.parse(b) || text(a, b);
}

/** The later of two timestamps, when there is one. */
export function laterTime(a: string | null, b: string | null) {
  return a && b ? (compareTimes(a, b) >= 0 ? a : b) : (a ?? b);
}

/** Adds messages to a thread without duplicates, oldest first. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  // The id makes the order total.
  return [...byId.values()].sort(
    (a, b) => compareTimes(a.created_at, b.created_at) || text(a.id, b.id),
  );
}

/**
 * What the sender sees under their newest message: Seen once the other maker has read up to it,
 * Delivered before. Nothing when the newest message is the other maker's.
 */
export function deliveryStatus(
  messages: ChatMessage[],
  userId: string,
  otherReadAt: string | null,
): "Delivered" | "Seen" | null {
  const newest = messages.at(-1);
  if (newest?.sender_id !== userId) return null;
  return otherReadAt && compareTimes(otherReadAt, newest.created_at) >= 0 ? "Seen" : "Delivered";
}

/** A time label is shown when the sender changes or five minutes pass since the last message. */
export function startsGroup(previous: ChatMessage | undefined, message: ChatMessage) {
  return (
    !previous ||
    previous.sender_id !== message.sender_id ||
    Date.parse(message.created_at) - Date.parse(previous.created_at) > 5 * 60_000
  );
}
