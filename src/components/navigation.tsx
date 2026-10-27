"use client";
import Link from "@/components/link";
import { useTranslations } from "next-intl";
import { usePagePath } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { sections } from "./sections";

export function Navigation({ className }: { className?: string }) {
  const t = useTranslations("chrome.nav");
  const path = usePagePath();
  return (
    <nav aria-label={t("label")} className={cn("items-center gap-1", className)}>
      {sections.map(([href, label, also]) => (
        <Link
          key={href}
          href={href}
          aria-current={
            path === href || (also as readonly string[]).includes(path) ? "page" : undefined
          }
          className="rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
        >
          {t(label)}
        </Link>
      ))}
    </nav>
  );
}
