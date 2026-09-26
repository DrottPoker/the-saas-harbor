"use client";

import { useEffect, useState } from "react";
import { reportUrl, type ReportRequest } from "@/lib/analytics-reports";

// Reports read in the last minute are shown again at once when a card switches back to them.
const cache = new Map<string, { at: number; data: unknown }>();
const FRESH_MS = 60_000;

type Result<T> = { url: string; data: T | null; error: boolean };

/**
 * Reads one report from /admin/analytics/data. While a new period or breakdown loads, the last
 * report stays in view, so the card keeps its size and the page never jumps. With `refreshMs` it
 * reads again on that interval while the page is visible.
 */
export function useReport<T>(request: ReportRequest | null, refreshMs?: number) {
  const url = request ? reportUrl(request) : null;
  const [result, setResult] = useState<Result<T> | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!url) return;
    let active = true;
    const controller = new AbortController();
    const load = (cached: boolean) => {
      const hit = cache.get(url);
      if (cached && hit && Date.now() - hit.at < FRESH_MS) {
        queueMicrotask(() => {
          if (active) setResult({ url, data: hit.data as T, error: false });
        });
        return;
      }
      fetch(url, { signal: controller.signal, cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error(`Status ${response.status}`);
          return response.json() as Promise<T>;
        })
        .then((data) => {
          cache.set(url, { at: Date.now(), data });
          if (active) setResult({ url, data, error: false });
        })
        .catch(() => {
          if (active && !controller.signal.aborted)
            setResult((previous) => ({
              url,
              data: previous?.url === url ? previous.data : null,
              error: true,
            }));
        });
    };
    load(attempt === 0);
    const timer = refreshMs
      ? setInterval(() => {
          if (document.visibilityState === "visible") load(false);
        }, refreshMs)
      : undefined;
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [url, attempt, refreshMs]);

  const current = result?.url === url ? result : null;
  return {
    data: current?.data ?? (current ? null : (result?.data ?? null)),
    loading: url !== null && current === null,
    error: current?.error ?? false,
    retry: () => setAttempt((value) => value + 1),
  };
}
