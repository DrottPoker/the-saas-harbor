"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isAdminPath, type SystemHints } from "@/lib/analytics";

type View = { key: string; visibleMs: number; since: number | null; sentMs: number };

// Client hints, where the browser offers them (Chromium browsers); not in TypeScript's DOM types.
type UserAgentData = {
  getHighEntropyValues(hints: string[]): Promise<{ platform?: string; platformVersion?: string }>;
};

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

/** A random key for a page view. Only this page knows it, so its time is reported with it. */
function newKey() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Outside a secure context: a version 4 UUID from random bytes.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

let hints: Promise<SystemHints> | null = null;

/**
 * What the user agent no longer tells: the system version from client hints, and whether an iPad
 * presents itself as a Mac, which only its touch screen gives away. Read once per page load.
 */
function systemHints() {
  hints ??= (async () => {
    const ipad = /\bMacintosh\b/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
    const data = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData;
    try {
      const values = await data?.getHighEntropyValues(["platformVersion"]);
      return { platform: values?.platform, version: values?.platformVersion, ipad };
    } catch {
      return { ipad };
    }
  })();
  return hints;
}

/**
 * When the loaded page became visible, in milliseconds from the start of its navigation, or null
 * while it is hidden, so the time before the page came to life counts too.
 */
function loadVisibleSince() {
  if (!visible()) return null;
  const navigation = performance.getEntriesByType("navigation")[0] as
    (PerformanceNavigationTiming & { activationStart?: number }) | undefined;
  // A prerendered page is seen only once it is activated.
  let since = navigation?.activationStart ?? 0;
  // Where the browser records visibility changes (Chromium), the last time the page was shown.
  const last = performance.getEntriesByType("visibility-state").at(-1);
  if (last) since = Math.max(since, last.name === "visible" ? last.startTime : performance.now());
  return since;
}

/** How long the page has been visible so far. */
function engaged(view: View) {
  return view.visibleMs + (view.since === null ? 0 : performance.now() - view.since);
}

/** The page's visible time, once it has grown by a second or more since it was last reported. */
function unreportedTime(view: View | null) {
  if (!view) return undefined;
  const ms = Math.round(engaged(view));
  if (ms - view.sentMs < 1000) return undefined;
  view.sentMs = ms;
  return { key: view.key, ms };
}

function reportTime(view: View | null) {
  const time = unreportedTime(view);
  if (time) send({ type: "engagement", ...time }).catch(() => {});
}

/**
 * Site statistics for the admin panel, sent to /api/analytics without storing anything on the
 * device: each page the browser shows (on load, then after each navigation to a new path) with a
 * random key, how long it was visible, reported by that key when it is hidden or left and with the
 * next page view, and clicks on links to other sites. Every page view carries the tab's referrer
 * and first address, which count only if the page starts a new visit. Query changes on the same
 * path, such as filters, are not new pages. Admin pages and automated browsers send nothing.
 */
export function PageViews() {
  const path = usePathname();
  const last = useRef<string | null>(null);
  const view = useRef<View | null>(null);
  // The address the tab loaded, with the campaign tags the visit came with.
  const landing = useRef<string | null>(null);

  useEffect(() => {
    // Also keeps React's development double run from counting a page twice.
    if (last.current === path) return;
    const first = last.current === null;
    last.current = path;
    const previous = view.current;
    view.current = null;
    if (isAdminPath(path) || automated()) {
      reportTime(previous);
      return;
    }
    const address = `${location.pathname}${location.search}`;
    if (first) landing.current = address;
    const current: View = {
      key: newKey(),
      visibleMs: 0,
      since: first ? loadVisibleSince() : visible() ? performance.now() : null,
      sentMs: 0,
    };
    view.current = current;
    const before = unreportedTime(previous);
    systemHints()
      .then((system) =>
        send({
          type: "pageview",
          key: current.key,
          path: address,
          referrer: document.referrer || null,
          landing: first ? null : landing.current,
          previous: before,
          system,
        }),
      )
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
