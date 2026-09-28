import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messages" };

// The right pane before a conversation is open. Below md the list shows instead.
export default async function Inbox() {
  await requireUser({ next: "/messages" });
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <MessageSquare aria-hidden="true" className="size-8 text-muted-foreground" />
      <h2 className="mt-4 text-lg font-semibold">Select a conversation</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Choose one of your conversations, or open a user&apos;s profile and choose Send message to
        start a new one.
      </p>
    </div>
  );
}
