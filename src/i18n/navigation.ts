import "server-only";
import { permanentRedirect, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { localizedPath } from "./config";

/** The address of a site path in this request's language. */
export async function localePath(path: string) {
  return localizedPath(await getLocale(), path);
}

/** `redirect()` to a site path in this request's language. */
export async function localeRedirect(
  path: string,
  type?: Parameters<typeof redirect>[1],
): Promise<never> {
  redirect(await localePath(path), type);
}

/** `permanentRedirect()` to a site path in this request's language. */
export async function localePermanentRedirect(
  path: string,
  type?: Parameters<typeof permanentRedirect>[1],
): Promise<never> {
  permanentRedirect(await localePath(path), type);
}
