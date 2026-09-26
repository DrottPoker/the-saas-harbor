"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isAdminPath } from "@/lib/analytics";

type View = { id: number | null; visibleMs: number; since: number | null; sentMs: number };

function send(body: object) {
  return fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  });
}

const visible = () => document.visibilityState === "visible";

// Browsers driven by automation (test runners, headless scrapers) say so, and are not visitors.
const automated = () => navigator.webdriver === true;

/** How long the page has been visible so far. */
function engaged(view: View) {
  return view.visibleMs + (view.since === null ? 0 : performance.now() - view.since);
}

/** Reports the visible time of a page once it has changed by a second or more. */
function reportTime(view: View | null) {
  if (!view || view.id === null) return;
  const ms = Math.round(engaged(view));
  if (ms - view.sentMs < 1000) return;
  view.sentMs = ms;
  send({ type: "engagement", id: view.id, ms }).catch(() => {});
}

/**
 * Site statistics for the admin panel, sent to /api/analytics without storing anything on the
 * device: each page the browser shows (on load with the referrer, then after each navigation to
 * a new path), how long it was visible, reported when it is hidden or left, and clicks on links to
 * other sites. Query changes on the same path, such as filters, are not new pages. Admin pages
 * and automated browsers send nothing.
 */
export function PageViews() {
  const path = usePathname();
  const last = useRef<string | null>(null);
  const view = useRef<View | null>(null);

  useEffect(() => {
    // Also keeps React's development double run from counting a page twice.
    if (last.current === path) return;
    const first = last.current === null;
    last.current = path;
    reportTime(view.current);
    view.current = null;
    if (isAdminPath(path) || automated()) return;
    const current: View = {
      id: null,
      visibleMs: 0,
      since: visible() ? performance.now() : null,
      sentMs: 0,
    };
    view.current = current;
    send({
      type: "pageview",
      path: `${location.pathname}${location.search}`,
      referrer: first ? document.referrer || null : null,
    })
      .then((response) => (response.status === 200 ? response.json() : null))
      .then((body: { id?: unknown } | null) => {
        if (typeof body?.id === "number") current.id = body.id;
      })
      .catch(() => {});
  }, [path]);

  useEffect(() => {
    function onVisibility() {
      const current = view.current;
      if (!current) return;
      if (visible()) {
        current.since ??= performance.now();
        return;
      }
      if (current.since !== null) {
        current.visibleMs += performance.now() - current.since;
        current.since = null;
      }
      reportTime(current);
    }
    function onLeave() {
      reportTime(view.current);
    }
    function onClick(event: MouseEvent) {
      if (event.type === "auxclick" && event.button !== 1) return;
      if (isAdminPath(location.pathname) || automated()) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      let url: URL;
      try {
        url = new URL(link.href, location.href);
      } catch {
        return;
      }
      if (url.origin === location.origin || !/^https?:$/.test(url.protocol)) return;
      send({
        type: "outbound",
        path: `${location.pathname}${location.search}`,
        url: url.href,
      }).catch(() => {});
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onLeave);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
    };
  }, []);

  return null;
}
