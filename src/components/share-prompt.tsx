"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { LinkedInIcon, XIcon } from "@/components/profile/brand-icons";
import { DialogPanel } from "@/components/route-dialog";
import { Button } from "@/components/ui/button";
import { forgetNewProduct } from "@/lib/new-product-cookie";
import { shareLinks } from "@/lib/share";

/**
 * Offers a founder to share the product they just added: a post on X with its text written, whose
 * link shows the product's sharing card, or a look at the page first. Closing the offer, opening
 * the post or the page forgets it, so it shows once.
 */
export function SharePrompt({
  name,
  url,
  path,
  text,
}: {
  name: string;
  url: string;
  /** The product page on this site, such as /saas/tidewise. */
  path: string;
  text: string;
}) {
  const [open, setOpen] = useState(true);
  const links = shareLinks(url, text);
  const close = () => {
    setOpen(false);
    forgetNewProduct();
  };
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && close()}>
      <DialogPanel
        title={`${name} is listed`}
        width="medium"
        description="Share it on X so more people find it. The post shows the product's card and links to its page, which links to your site."
      >
        <p className="rounded-lg border bg-subtle p-4 text-sm break-words whitespace-pre-line">
          {`${text}\n\n${url}`}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild>
            <a href={links.x} target="_blank" rel="noopener noreferrer" onClick={close}>
              <XIcon />
              Share on X
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={links.linkedin} target="_blank" rel="noopener noreferrer" onClick={close}>
              <LinkedInIcon />
              Share on LinkedIn
            </a>
          </Button>
          <Dialog.Close asChild>
            <Button variant="ghost">Not now</Button>
          </Dialog.Close>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Want to see it first?{" "}
          <Link
            href={path}
            onClick={close}
            className="font-medium text-foreground underline underline-offset-2"
          >
            View your page
          </Link>
        </p>
      </DialogPanel>
    </Dialog.Root>
  );
}
