import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { PersonAvatar } from "@/components/avatars";
import { BackLink } from "@/components/back-link";
import { BlockControl } from "@/components/messages/block-control";
import { Conversation } from "@/components/messages/conversation";
import { Notice, Shell } from "@/components/shell";
import { publicProfile } from "@/lib/data";
import { MESSAGE_COLUMNS, MESSAGE_PAGE_SIZE, type ChatMessage } from "@/lib/messages";
import { currentUser, serverClient } from "@/lib/supabase/server";

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
  const user = await currentUser();
  if (!user) redirect(`/auth?next=/messages/${id}`);
  if (id === user.id) redirect("/messages");
  const other = await publicProfile(id);
  if (!other) notFound();

  const client = await serverClient();
  const [me, conversation, block] = await Promise.all([
    client.from("profiles").select("id").eq("id", user.id).maybeSingle(),
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
  if (conversation.data) {
    const { data, error } = await client
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", conversation.data.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);
    if (error) throw new Error("This conversation could not be loaded.");
    messages = data.reverse();
  }
  const blocked = !!block.data;

  return (
    <Shell size="narrow">
      <BackLink href="/messages">Messages</BackLink>
      <div className="mt-4 flex items-center gap-4 border-b pb-6">
        <PersonAvatar path={other.avatar_path} name={other.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{other.name}</h1>
          <Link
            href={`/makers/${other.id}`}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            View profile
          </Link>
        </div>
        {me.data && <BlockControl makerId={other.id} name={other.name} blocked={blocked} />}
      </div>
      <div className="pt-6">
        <Conversation
          userId={user.id}
          other={{ id: other.id, name: other.name }}
          initialConversationId={conversation.data?.id ?? null}
          initialMessages={messages}
          initialHasEarlier={messages.length === MESSAGE_PAGE_SIZE}
          canSend={!!me.data && !blocked}
          closedNotice={
            !me.data ? (
              <Notice>
                Set up your{" "}
                <Link href="/dashboard/profile" className="font-medium underline">
                  maker profile
                </Link>{" "}
                before sending messages. Other makers see your name and photo.
              </Notice>
            ) : (
              <Notice>
                You blocked {other.name}. Neither of you can send messages until you unblock them.
              </Notice>
            )
          }
        />
      </div>
    </Shell>
  );
}
