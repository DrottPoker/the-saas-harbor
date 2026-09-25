"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { markConversationReadAction, sendMessageAction } from "@/app/message-actions";
import { MESSAGE_MAX_LENGTH } from "@/lib/domain";
import {
  MESSAGE_COLUMNS,
  MESSAGE_PAGE_SIZE,
  mergeMessages,
  startsGroup,
  type ChatMessage,
  type SendState,
} from "@/lib/messages";
import { reportPath } from "@/lib/moderation";
import { browserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { Submit } from "../forms";
import { LocalTime } from "../local-time";
import { Notice } from "../shell";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { notifyUnreadChange, onMessage, type MessageEvent } from "./live";

type Scroll = "bottom" | { fromBottom: number } | null;

export function Conversation({
  userId,
  other,
  initialConversationId,
  initialMessages,
  initialHasEarlier,
  canSend,
  closedNotice,
}: {
  userId: string;
  other: { id: string; name: string };
  initialConversationId: string | null;
  initialMessages: ChatMessage[];
  initialHasEarlier: boolean;
  canSend: boolean;
  /** Shown instead of the composer when the maker cannot send. */
  closedNotice?: React.ReactNode;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [hasEarlier, setHasEarlier] = useState(initialHasEarlier);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const scroll = useRef<Scroll>("bottom");
  const readUpTo = useRef<string | null>(null);

  // Keeps the newest message in view, or the reading position when earlier messages load.
  useLayoutEffect(() => {
    const element = log.current;
    const target = scroll.current;
    scroll.current = null;
    if (!element || !target) return;
    element.scrollTop =
      target === "bottom" ? element.scrollHeight : element.scrollHeight - target.fromBottom;
  }, [messages]);

  function add(incoming: ChatMessage[]) {
    if (!incoming.length) return;
    const element = log.current;
    if (element && element.scrollHeight - element.scrollTop - element.clientHeight < 80)
      scroll.current = "bottom";
    setConversationId(incoming[0].conversation_id);
    setMessages((list) => mergeMessages(list, incoming));
  }

  // Reading happens when the newest message from the other maker is on screen.
  const markRead = useEffectEvent(async () => {
    const newest = messages.findLast((message) => message.sender_id !== userId);
    if (!conversationId || !newest || document.visibilityState !== "visible") return;
    if (readUpTo.current && Date.parse(readUpTo.current) >= Date.parse(newest.created_at)) return;
    readUpTo.current = newest.created_at;
    await markConversationReadAction(conversationId, newest.created_at);
    notifyUnreadChange();
  });

  // Messages that arrived while the tab was hidden or the connection was down.
  const catchUp = useEffectEvent(async () => {
    const client = browserClient();
    if (!conversationId || !client) return;
    const { data } = await client
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);
    if (data) add(data);
  });

  const receive = useEffectEvent(async (event: MessageEvent) => {
    const here = conversationId
      ? event.conversation_id === conversationId
      : event.sender_id === other.id;
    if (!here || messages.some((message) => message.id === event.id)) return;
    const { data } = (await browserClient()
      ?.from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("id", event.id)) ?? { data: null };
    if (data) add(data);
  });

  useEffect(() => {
    void markRead();
  }, [messages]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void markRead();
      void catchUp();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => onMessage(userId, (event) => void receive(event)), [userId]);

  async function loadEarlier() {
    const client = browserClient();
    const oldest = messages[0];
    if (!client || !oldest || !conversationId) return;
    setLoadingEarlier(true);
    const { data } = await client
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", conversationId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);
    setLoadingEarlier(false);
    if (!data) return;
    const element = log.current;
    if (element) scroll.current = { fromBottom: element.scrollHeight - element.scrollTop };
    setHasEarlier(data.length === MESSAGE_PAGE_SIZE);
    setMessages((list) => mergeMessages(list, data));
  }

  const [state, send] = useActionState<SendState & { draft?: string }, FormData>(
    async (previous, form) => {
      const result = await sendMessageAction(other.id, previous, form);
      const sent = result.message;
      if (sent) {
        scroll.current = "bottom";
        setConversationId(sent.conversation_id);
        setMessages((list) => mergeMessages(list, [sent]));
      }
      // A failed message stays in the field.
      return { ...result, draft: sent ? "" : String(form.get("body") ?? "") };
    },
    {},
  );

  return (
    <div className="grid gap-4">
      <div
        ref={log}
        role="log"
        aria-label={`Messages with ${other.name}`}
        tabIndex={0}
        className="max-h-[min(60vh,40rem)] min-h-56 overflow-y-auto rounded-xl border bg-surface p-4 sm:p-5"
      >
        {hasEarlier && (
          <div className="mb-4 text-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={loadEarlier}
              disabled={loadingEarlier}
            >
              {loadingEarlier ? "Loading..." : "Show earlier messages"}
            </Button>
          </div>
        )}
        {messages.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No messages yet. Say hello to {other.name}.
          </p>
        ) : (
          <ol className="grid gap-1">
            {messages.map((message, index) => {
              const mine = message.sender_id === userId;
              const group = startsGroup(messages[index - 1], message);
              return (
                <li
                  key={message.id}
                  className={cn(
                    "group flex flex-col",
                    mine ? "items-end" : "items-start",
                    group && index > 0 && "mt-4",
                  )}
                >
                  {group && (
                    <LocalTime
                      value={message.created_at}
                      className="mb-1 px-1 text-xs text-muted-foreground"
                    />
                  )}
                  <p
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2 leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]",
                      mine
                        ? "rounded-br-md bg-primary text-primary-foreground"
                        : "rounded-bl-md bg-muted text-foreground",
                    )}
                  >
                    <span className="sr-only">{mine ? "You" : other.name}: </span>
                    {message.body}
                  </p>
                  {/* With a mouse the link appears on hover or focus; on touch screens it stays. */}
                  {!mine && (
                    <Link
                      href={reportPath("message", message.id)}
                      rel="nofollow"
                      className="px-1.5 py-1 text-xs text-muted-foreground transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-foreground hover:underline focus-visible:opacity-100 [@media(hover:hover)]:opacity-0"
                    >
                      Report<span className="sr-only"> this message from {other.name}</span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {canSend ? (
        <form action={send} className="grid gap-3">
          <label htmlFor="message-body" className="sr-only">
            Message to {other.name}
          </label>
          <Textarea
            id="message-body"
            name="body"
            rows={3}
            required
            maxLength={MESSAGE_MAX_LENGTH}
            placeholder={`Write to ${other.name}`}
            defaultValue={state.draft}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          {state.error && <Notice tone="error">{state.error}</Notice>}
          <div className="flex items-center justify-between gap-4">
            <p className="text-[13px] text-muted-foreground">
              Only you and {other.name} can read this conversation.
            </p>
            <Submit pendingLabel="Sending...">Send</Submit>
          </div>
        </form>
      ) : (
        closedNotice
      )}
    </div>
  );
}
