"use client";

import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { LogoMark } from "./logo";
import { Button } from "./ui/button";

/**
 * The sign-in forms in a dialog over the page the visitor was on. It opens on a link to /auth
 * inside the site; closing it goes back in history, so the address and the back button agree.
 */
export function AuthDialog({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <Dialog.Root defaultOpen onOpenChange={(open) => !open && router.back()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-fade-in-fast" />
        {/* Anchored at the top rather than centered, so it keeps its place when a step is taller. */}
        <Dialog.Content className="fixed top-[max(1rem,8vh)] left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[26rem] -translate-x-1/2 overflow-y-auto rounded-2xl border bg-surface p-6 text-foreground shadow-float focus:outline-none data-[state=open]:animate-dialog-in sm:p-8">
          <LogoMark className="size-10" />
          <Dialog.Title className="mt-5 text-xl font-semibold tracking-tight">{title}</Dialog.Title>
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
    </Dialog.Root>
  );
}
