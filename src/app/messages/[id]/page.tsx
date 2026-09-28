import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { PersonAvatar } from "@/components/avatars";
import { BlockControl } from "@/components/messages/block-control";
import { Conversation } from "@/components/messages/conversation";
import { Notice } from "@/components/shell";
import { publicProfile } from "@/lib/data";
import { MESSAGE_COLUMNS, MESSAGE_PAGE_SIZE, type ChatMessage } from "@/lib/messages";
import { requireUser, serverClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return {};
  const profile = await publicProfile(id);
  return profile ? { title: `Messages with ${profile.name}` } : {};
}

// The route is the other maker's id: a pair of makers has one conversation, which is created
// with the first message.
export default async function ConversationPage({ params }: Props) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { user } = await requireUser({ next: `/messages/${id}` });
  if (id === user.id) redirect("/messages");
  const other = await publicProfile(id);
  if (!other) notFound();

  const client = await serverClient();
  const [me, conversation, block] = await Promise.all([
    client.from("profiles").select("id, suspended_at").eq("id", user.id).maybeSingle(),
    client
      .from("conversations")
      .select("id")
      .in("user_a", [user.id, id])
      .in("user_b", [user.id, id])
      .maybeSingle(),
    client
      .from("blocks")
      .select("blocked_id")
      .eq("blocker_id", user.id)
      .eq("blocked_id", id)
      .maybeSingle(),
  ]);
  if (me.error || conversation.error || block.error)
    throw new Error("This conversation could not be loaded.");
  let messages: ChatMessage[] = [];
  let otherReadAt: string | null = null;
  if (conversation.data) {
    const [page, read] = await Promise.all([
      client
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .eq("conversation_id", conversation.data.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE),
      client
        .from("conversation_reads")
        .select("read_at")
        .eq("conversation_id", conversation.data.id)
        .eq("user_id", id)
        .maybeSingle(),
    ]);
    if (page.error || read.error) throw new Error("This conversation could not be loaded.");
    messages = page.data.reverse();
    otherReadAt = read.data?.read_at ?? null;
  }
  const blocked = !!block.data;
  const suspended = !!me.data?.suspended_at;

  // The right pane of the messages layout; below md it fills the window alone.
  return (
    <>
      <div className="flex min-h-14 shrink-0 items-center gap-3 border-b py-2 pr-4 pl-2 md:pl-4">
        <Link
          href="/messages"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground md:hidden"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          <span className="sr-only">Back to messages</span>
        </Link>
        <PersonAvatar path={other.avatar_path} name={other.name} size="sm" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate leading-tight font-semibold">{other.name}</h1>
          <Link
            href={`/users/${other.slug}`}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            View profile
          </Link>
        </div>
        {me.data && <BlockControl makerId={other.id} name={other.name} blocked={blocked} />}
      </div>
      <Conversation
        key={other.id}
        userId={user.id}
        other={{ id: other.id, name: other.name }}
        initialConversationId={conversation.data?.id ?? null}
        initialMessages={messages}
        initialHasEarlier={messages.length === MESSAGE_PAGE_SIZE}
        initialOtherReadAt={otherReadAt}
        canSend={!!me.data && !blocked && !suspended}
        closedNotice={
          !me.data ? (
            <Notice>
              Set up your{" "}
              <Link href="/dashboard/profile" className="font-medium underline">
                profile
              </Link>{" "}
              before sending messages. Other users see your name and photo.
            </Notice>
          ) : suspended ? (
            <Notice>
              Your account is suspended, so you cannot send messages. Your{" "}
              <Link href="/dashboard" className="font-medium underline">
                dashboard
              </Link>{" "}
              explains why.
            </Notice>
          ) : (
            <Notice>
              You blocked {other.name}. Neither of you can send messages until you unblock them.
            </Notice>
          )
        }
      />
    </>
  );
}
