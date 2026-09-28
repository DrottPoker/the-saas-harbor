import { Suspense } from "react";
import { ConversationList } from "@/components/messages/conversation-list";
import { MessagesPanes } from "@/components/messages/panes";
import { ConversationListSkeleton } from "@/components/messages/skeletons";
import { INBOX_COLUMNS } from "@/lib/messages";
import { currentUser, serverClient } from "@/lib/supabase/server";

// The conversation list stays on screen while conversations open beside it. The pages ask
// visitors to sign in.
export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return (
    <MessagesPanes
      list={
        <Suspense fallback={<ConversationListSkeleton />}>
          <Conversations />
        </Suspense>
      }
    >
      {children}
    </MessagesPanes>
  );
}

async function Conversations() {
  const user = await currentUser();
  if (!user) return null;
  const client = await serverClient();
  const { data, error } = await client
    .from("inbox")
    .select(INBOX_COLUMNS)
    .order("last_message_at", { ascending: false });
  if (error) throw new Error("Your messages could not be loaded.");
  return <ConversationList userId={user.id} initialConversations={data} />;
}
