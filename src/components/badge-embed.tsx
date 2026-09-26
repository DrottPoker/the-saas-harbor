"use client";

import { useState } from "react";
import { badgeEmbedCode, BADGE_HEIGHT, type BadgeTheme } from "@/lib/badge";
import { SITE_NAME } from "@/lib/seo";
import { CopyField } from "./copy-field";
import { Section } from "./forms";
import { Button } from "./ui/button";

/** The product editor's badge section: a preview in either theme and the code to paste. */
export function BadgeEmbed({
  path,
  pageUrl,
  name,
}: {
  /** The product page's path, which the preview loads from this site. */
  path: string;
  /** The product page's public address, which the code links to. */
  pageUrl: string;
  name: string;
}) {
  const [theme, setTheme] = useState<BadgeTheme>("light");
  const code = badgeEmbedCode({ pageUrl, name, theme });
  return (
    <div id="badge" className="mt-2 border-t pt-8">
      <Section
        title="Badge for your website"
        description={`Shows your verified MRR on your own site and links to your product page. It shows the figure only while you share it; otherwise it says Listed on ${SITE_NAME}.`}
      >
        <div
          role="group"
          aria-label="Badge theme"
          className="flex w-fit gap-1 rounded-lg border p-1"
        >
          {(["light", "dark"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={theme === option ? "secondary" : "ghost"}
              aria-pressed={theme === option}
              onClick={() => setTheme(option)}
            >
              {option === "light" ? "Light" : "Dark"}
            </Button>
          ))}
        </div>
        <div className="flex rounded-xl border bg-background p-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- A live SVG from this site. */}
          <img
            src={`${path}/badge.svg${theme === "dark" ? "?theme=dark" : ""}`}
            alt={`Badge preview: ${name} on ${SITE_NAME}`}
            height={BADGE_HEIGHT}
            className="h-13 w-auto"
          />
        </div>
        <CopyField id="badge_html" label="HTML" value={code.html} multiline />
        <CopyField id="badge_markdown" label="Markdown" value={code.markdown} multiline />
      </Section>
    </div>
  );
}
