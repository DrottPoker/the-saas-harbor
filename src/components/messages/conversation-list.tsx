"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { INBOX_COLUMNS, type InboxConversation } from "@/lib/messages";
import { browserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { PersonAvatar } from "../avatars";
import { LocalTime } from "../local-time";
import { Button } from "../ui/button";
import { onJoin, onMessage, onUnreadChange } from "./live";

/** The left pane of Messages: every conversation, newest first, updated live. */
export function ConversationList({
  userId,
  initialConversations,
}: {
  userId: string;
  initialConversations: InboxConversation[];
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [serverConversations, setServerConversations] = useState(initialConversations);
  // A fresh server render, such as after a block, brings a fresh list.
  if (serverConversations !== initialConversations) {
    setServerConversations(initialConversations);
    setConversations(initialConversations);
  }
  // The other user's id while a conversation is open.
  const openId = useSelectedLayoutSegment();
  // The open conversation's name is the page heading.
  const Heading = openId ? "h2" : "h1";

  useEffect(() => {
    // Lists can arrive out of order; the most recently requested one wins.
    let requested = 0;
    const refresh = async () => {
      const request = ++requested;
      const { data, error } = (await browserClient()
        ?.from("inbox")
        .select(INBOX_COLUMNS)
        .order("last_message_at", { ascending: false })) ?? { data: null, error: null };
      if (request === requested && !error && data) setConversations(data);
    };
    const stops = [
      onMessage(userId, () => void refresh()),
      onUnreadChange(() => void refresh()),
      onJoin(() => void refresh()),
    ];
    return () => {
      for (const stop of stops) stop();
    };
  }, [userId]);

  return (
    <>
      <div className="flex min-h-14 shrink-0 items-center border-b px-4">
        <Heading className="text-lg font-semibold tracking-tight">Messages</Heading>
      </div>
      {conversations.length ? (
        <ul aria-label="Conversations" className="min-h-0 flex-1 overflow-y-auto">
          {conversations.map((conversation) => {
            const open = conversation.other_id === openId;
            // The open conversation is read as its messages arrive.
            const unread = open ? 0 : (conversation.unread ?? 0);
            return (
              <li key={conversation.id}>
                <Link
                  href={`/messages/${conversation.other_id}`}
                  aria-current={open ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition-colors",
                    open ? "bg-muted" : "hover:bg-subtle",
                  )}
                >
                  <PersonAvatar
                    path={conversation.other_avatar_path}
                    name={conversation.other_name ?? "User"}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span
                        className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}
                      >
                        {conversation.other_name}
                      </span>
                      {conversation.last_message_at && (
                        <LocalTime
                          short
                          value={conversation.last_message_at}
                          className="shrink-0 text-xs text-muted-foreground"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <p
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          unread ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {conversation.blocked && "Blocked · "}
                        {conversation.last_sender_id === userId && "You: "}
                        {conversation.last_body}
                      </p>
                      {unread > 0 && (
                        <span className="min-w-5 shrink-0 rounded-full bg-brand px-1.5 text-center text-xs leading-5 font-medium text-primary-foreground tabular-nums">
                          {unread}
                          <span className="sr-only"> unread</span>
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : openId ? (
        // The first conversation is open beside this, so there is nothing to explain.
        <p className="px-4 py-6 text-sm text-muted-foreground">
          Your conversations show here once a message is sent.
        </p>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <p className="font-semibold">No messages yet</p>
          <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
            Open a product or a user&apos;s profile and choose Send message to start a conversation.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link href="/browse">Browse products</Link>
          </Button>
        </div>
      )}
    </>
  );
}
