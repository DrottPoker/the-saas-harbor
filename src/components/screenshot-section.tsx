"use client";

import { requestScreenshotAction } from "@/app/screenshot-actions";
import { formatDate } from "@/lib/domain";
import { Feedback, Section, Submit } from "./forms";
import { Notice } from "./shell";
import { useEditorAction } from "./use-editor-action";

/**
 * The product editor's screenshot section: the current screenshot or how it is coming along, and
 * a button to take a new one. `url` is the stored image's public address.
 */
export function ScreenshotSection({
  saasId,
  url,
  site,
  takenAt,
  enabled,
  status,
}: {
  saasId: string;
  url: string | null;
  site: string | null;
  takenAt: string | null;
  enabled: boolean;
  status: { requested_at: string | null; last_error: string | null } | null;
}) {
  const [state, action] = useEditorAction(requestScreenshotAction.bind(null, saasId));
  return (
    <div id="screenshot" className="mt-2 border-t pt-8">
      <Section
        title="Screenshot"
        description="A picture of your website's landing page on the product page. It is taken for you, and again every 30 days."
      >
        {!enabled ? (
          <p className="text-sm text-muted-foreground">
            The screenshot is turned off. Turn it on under Visibility above to show one.
          </p>
        ) : (
          <>
            {url ? (
              <figure className="grid gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener"
                  className="block overflow-hidden rounded-lg border bg-subtle"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- A stored image of any height. */}
                  <img
                    src={url}
                    alt={`Screenshot of ${site ?? "the website"}`}
                    className="aspect-[16/10] w-full object-cover object-top"
                  />
                </a>
                <figcaption className="text-[13px] text-muted-foreground">
                  Taken {formatDate(takenAt)}.
                </figcaption>
              </figure>
            ) : (
              !status?.last_error && (
                <p className="text-sm text-muted-foreground">
                  A screenshot of your website is taken within a few minutes.
                </p>
              )
            )}
            {status?.last_error && (
              <Notice tone="error">
                The last attempt failed: {status.last_error} It is tried again later.
              </Notice>
            )}
            {url && status?.requested_at && (
              <p className="text-sm text-muted-foreground">
                A new screenshot is taken within a few minutes.
              </p>
            )}
            <form action={action} className="grid gap-4">
              <Feedback state={state} />
              <div>
                <Submit variant="outline" pendingLabel="Asking...">
                  Take a new screenshot
                </Submit>
              </div>
            </form>
          </>
        )}
      </Section>
    </div>
  );
}
