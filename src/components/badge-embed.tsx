"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { badgeEmbedCode, BADGE_HEIGHT, type BadgeTheme } from "@/lib/badge";
import { SITE_NAME } from "@/lib/seo";
import { CopyField } from "./copy-field";
import { Section } from "./forms";
import { Button } from "./ui/button";

/**
 * The product editor's badge section: a preview in either theme and the code to paste. The badge
 * itself is in English, as every site that shows it gets the same image.
 */
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
  const t = useTranslations("saasForm.badge");
  const [theme, setTheme] = useState<BadgeTheme>("light");
  const code = badgeEmbedCode({ pageUrl, name, theme });
  return (
    <div id="badge" className="mt-2 border-t pt-8">
      <Section title={t("title")} description={t("description", { site: SITE_NAME })}>
        <div
          role="group"
          aria-label={t("theme")}
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
              {t(option)}
            </Button>
          ))}
        </div>
        <div className="flex rounded-xl border bg-background p-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- A live SVG from this site. */}
          <img
            src={`${path}/badge.svg${theme === "dark" ? "?theme=dark" : ""}`}
            alt={t("preview", { name, site: SITE_NAME })}
            height={BADGE_HEIGHT}
            className="h-13 w-auto"
          />
        </div>
        {/* Code reads left to right in every language. */}
        <div dir="ltr" className="grid gap-5">
          <CopyField id="badge_html" label="HTML" value={code.html} multiline />
          <CopyField id="badge_markdown" label="Markdown" value={code.markdown} multiline />
        </div>
      </Section>
    </div>
  );
}
