"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Messages in two panes that fill the window below the header: the conversations on the left and
 * the open one on the right. Below md only one shows, the list at /messages and the conversation at
 * /messages/<id>.
 */
export function MessagesPanes({
  list,
  children,
}: {
  list: React.ReactNode;
  children: React.ReactNode;
}) {
  const open = useSelectedLayoutSegment() !== null;
  return (
    <div className="mx-auto w-full max-w-6xl sm:px-6 sm:pt-6">
      {/* The header is 3.5 rem, and below md a second row of 2.75 rem, each with a border. */}
      <div
        className={cn(
          "grid h-[calc(100dvh-6.25rem-2px)] min-h-[26rem] grid-cols-1 overflow-hidden bg-surface",
          "sm:h-[calc(100dvh-9.25rem-2px)] sm:rounded-xl sm:border sm:shadow-card",
          "md:h-[calc(100dvh-6.5rem-1px)] md:grid-cols-[18rem_minmax(0,1fr)] lg:grid-cols-[21rem_minmax(0,1fr)]",
        )}
      >
        <div className={cn("flex min-h-0 flex-col md:border-r", open && "max-md:hidden")}>
          {list}
        </div>
        <div className={cn("flex min-h-0 flex-col", !open && "max-md:hidden")}>{children}</div>
      </div>
    </div>
  );
}
