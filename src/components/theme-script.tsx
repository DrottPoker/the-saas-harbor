"use client";
import { useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { themeScript } from "@/lib/theme";

/**
 * Applies a saved theme before first paint. The script is only in the server's HTML: React never
 * runs a script it creates in the browser, and warns about one, which happens whenever it draws the
 * root layout itself, as on a missing page. ThemeMenu re-applies the theme there.
 */
export function ThemeScript({ nonce }: { nonce?: string }) {
  const inserted = useRef(false);
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />;
  });
  return null;
}
