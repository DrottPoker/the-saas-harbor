"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

const widths = { narrow: "max-w-[26rem]", medium: "max-w-[34rem]" } as const;

// The path of the last route dialog shown, for the site statistics: closing it returns to the page
// beneath, whose view goes on rather than counting as a new one (src/components/page-views.tsx).
let shownPath: string | null = null;

/** Reads, and forgets, which path the last route dialog was shown at. */
export function takeShownDialogPath() {
  const path = shownPath;
  shownPath = null;
  return path;
}

/**
 * A page in a dialog over the page the user was on, such as sign-in or feedback. It opens on a link
 * inside the site to a route that `src/app/@modal` intercepts; closing it goes back in history, so
 * the address and the back button agree.
 */
export function RouteDialog({
  title,
  description,
  icon,
  width = "narrow",
  titleRef,
  children,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
  width?: keyof typeof widths;
  /** For moving focus to the title when the content changes, such as after sending a form. */
  titleRef?: React.Ref<HTMLHeadingElement>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  useEffect(() => {
    shownPath = location.pathname;
  }, []);
  // The link that opened the dialog has focus while it first renders. Radix returns focus to its
  // own trigger, which a dialog opened by an address does not have, so focus goes back here.
  const [opener] = useState(() =>
    typeof document !== "undefined" &&
    document.activeElement instanceof HTMLElement &&
    !document.activeElement.closest("[role=dialog]")
      ? document.activeElement
      : null,
  );
  return (
    <Dialog.Root defaultOpen onOpenChange={(open) => !open && router.back()}>
      <DialogPanel
        title={title}
        description={description}
        icon={icon}
        width={width}
        titleRef={titleRef}
        onCloseAutoFocus={(event) => {
          if (!opener?.isConnected) return;
          event.preventDefault();
          opener.focus();
        }}
      >
        {children}
      </DialogPanel>
    </Dialog.Root>
  );
}

/**
 * A dialog's overlay and panel, with its title, description and close button, inside a
 * `Dialog.Root` that opens and closes it.
 */
export function DialogPanel({
  title,
  description,
  icon,
  width = "narrow",
  titleRef,
  onCloseAutoFocus,
  children,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
  width?: keyof typeof widths;
  titleRef?: React.Ref<HTMLHeadingElement>;
  onCloseAutoFocus?: (event: Event) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-fade-in-fast" />
      {/* Anchored at the top rather than centered, so it keeps its place when a step is taller. */}
      <Dialog.Content
        onCloseAutoFocus={onCloseAutoFocus}
        className={cn(
          "fixed top-[max(1rem,8vh)] left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 overflow-y-auto rounded-2xl border bg-surface p-6 text-foreground shadow-float focus:outline-none data-[state=open]:animate-dialog-in sm:p-8",
          widths[width],
        )}
      >
        {icon}
        <Dialog.Title
          ref={titleRef}
          tabIndex={-1}
          className={cn(
            "pr-8 text-xl font-semibold tracking-tight focus:outline-none",
            icon ? "mt-5" : undefined,
          )}
        >
          {title}
        </Dialog.Title>
        <Dialog.Description className="mt-1 text-muted-foreground">
          {description}
        </Dialog.Description>
        <div className="mt-7">{children}</div>
        <Dialog.Close asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
          >
            <X />
          </Button>
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

/** Loads the full page instead of the dialog, where a dialog over the current page does not fit. */
export function FullPageLoad({ href }: { href: string }) {
  useEffect(() => window.location.replace(href), [href]);
  return null;
}
