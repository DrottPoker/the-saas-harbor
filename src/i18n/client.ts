"use client";
import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { localizedPath, splitLocale } from "./config";

/** The page's path without its language prefix: /browse on /es/browse too. */
export function usePagePath() {
  return splitLocale(usePathname()).path;
}

/** Turns a site path into the address in the page's language. */
export function useLocalePath() {
  const locale = useLocale();
  return useCallback((path: string) => localizedPath(locale, path), [locale]);
}

/** `useRouter()` whose push and replace take site paths in the page's language. */
export function useLocaleRouter() {
  const router = useRouter();
  const localize = useLocalePath();
  return {
    ...router,
    push: (path: string, options?: Parameters<typeof router.push>[1]) =>
      router.push(localize(path), options),
    replace: (path: string, options?: Parameters<typeof router.replace>[1]) =>
      router.replace(localize(path), options),
  };
}
