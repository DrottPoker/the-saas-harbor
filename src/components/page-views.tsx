"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isAdminPath } from "@/lib/analytics";

/**
 * Reports each page the browser shows to /api/analytics for the admin panel's statistics: on
 * load with the referrer, and after each navigation to a new path. Nothing is stored on the
 * device. Query changes on the same path, such as filters, are not new pages.
 */
export function PageViews() {
  const path = usePathname();
  const last = useRef<string | null>(null);
  useEffect(() => {
    // Also keeps React's development double run from counting a page twice.
    if (last.current === path) return;
    const first = last.current === null;
    last.current = path;
    if (isAdminPath(path)) return;
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: `${location.pathname}${location.search}`,
        referrer: first ? document.referrer || null : null,
      }),
      keepalive: true,
    }).catch(() => {});
  }, [path]);
  return null;
}
