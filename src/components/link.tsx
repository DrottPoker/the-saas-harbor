import type { ComponentProps } from "react";
import NextLink from "next/link";
import { useLocale } from "next-intl";
import { localizedPath } from "@/i18n/config";

/**
 * A link within the site, in the page's language: /browse on an English page, /es/browse on a
 * Spanish one. Use it instead of next/link; files and routes for machines keep their address.
 * Works in Server and Client Components alike.
 */
export default function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const locale = useLocale();
  const target =
    typeof href === "string"
      ? localizedPath(locale, href)
      : href.pathname
        ? { ...href, pathname: localizedPath(locale, href.pathname) }
        : href;
  return <NextLink href={target} {...props} />;
}
