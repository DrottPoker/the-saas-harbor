import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PersonAvatar } from "@/components/avatars";
import { LocalTime } from "@/components/local-time";
import { RefreshOnMessage } from "@/components/messages/refresh-on-message";
import { EmptyState, PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { currentUser, serverClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Messages" };

export default async function Inbox() {
  const user = await currentUser();
  if (!user) redirect("/auth?next=/messages");
  const client = await serverClient();
  const { data: conversations, error } = await client
    .from("inbox")
    .select("*")
    .order("last_message_at", { ascending: false });
  if (error) throw new Error("Your messages could not be loaded.");

  return (
    <Shell size="medium">
      <RefreshOnMessage userId={user.id} />
      <PageHeader title="Messages" description="Private conversations with other users." />
      {!conversations.length ? (
        <EmptyState
          title="No messages yet"
          action={
            <Button asChild variant="outline">
              <Link href="/">Browse the leaderboard</Link>
            </Button>
          }
        >
          Open a user&apos;s profile and choose Send message to start a conversation.
        </EmptyState>
      ) : (
        <ul aria-label="Conversations" className="divide-y rounded-xl border bg-surface">
          {conversations.map((conversation) => {
            const unread = conversation.unread ?? 0;
            return (
              <li key={conversation.id}>
                <Link
                  href={`/messages/${conversation.other_id}`}
                  className="flex items-center gap-4 p-4 transition-colors hover:bg-subtle"
                >
                  <PersonAvatar
                    path={conversation.other_avatar_path}
                    name={conversation.other_name ?? "User"}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={cn("truncate", unread ? "font-semibold" : "font-medium")}>
                        {conversation.other_name}
                      </span>
                      {conversation.last_message_at && (
                        <LocalTime
                          value={conversation.last_message_at}
                          className="shrink-0 text-xs text-muted-foreground"
                        />
                      )}
                    </div>
                    <p
                      className={cn(
                        "truncate text-sm",
                        unread ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {conversation.blocked && "Blocked · "}
                      {conversation.last_sender_id === user.id && "You: "}
                      {conversation.last_body}
                    </p>
                  </div>
                  {unread > 0 && (
                    <span className="min-w-5 shrink-0 rounded-full bg-brand px-1.5 text-center text-xs leading-5 font-medium text-primary-foreground tabular-nums">
                      {unread}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}
