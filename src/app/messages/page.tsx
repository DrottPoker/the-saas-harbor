import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("messages.meta");
  return { title: t("title") };
}

// The right pane before a conversation is open. Below md the list shows instead.
export default async function Inbox() {
  await requireUser({ next: "/messages" });
  const t = await getTranslations("messages.inbox");
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <MessageSquare aria-hidden="true" className="size-8 text-muted-foreground" />
      <h2 className="mt-4 text-lg font-semibold">{t("title")}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{t("body")}</p>
    </div>
  );
}
