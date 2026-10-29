import Link from "@/components/link";
import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "../ui/button";

/** Opens the conversation with a maker. Visitors sign in first and continue there. */
export function SendMessageButton({
  makerId,
  viewerId,
  size,
  className,
}: {
  makerId: string;
  viewerId: string | null;
  size?: "sm" | "default";
  className?: string;
}) {
  const t = useTranslations("messages");
  if (viewerId === makerId) return null;
  const path = `/messages/${makerId}`;
  return (
    <Button asChild variant="outline" size={size} className={className}>
      <Link href={viewerId ? path : `/auth?next=${encodeURIComponent(path)}`}>
        <MessageSquare />
        {t("sendButton")}
      </Link>
    </Button>
  );
}
