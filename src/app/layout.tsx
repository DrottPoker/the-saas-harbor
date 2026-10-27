import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Arabic, Noto_Sans_Devanagari } from "next/font/google";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { ClientMessages } from "@/components/client-messages";
import { FeedbackButton } from "@/components/feedback-button";
import { ServerClockProvider } from "@/components/local-time";
import { MoneyProvider } from "@/components/money-provider";
import { PageViews } from "@/components/page-views";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ThemeScript } from "@/components/theme-script";
import { VercelAnalytics } from "@/components/vercel-analytics";
import { LOCALE_INFO, LOCALES } from "@/i18n/config";
import { accountMenu } from "@/lib/account-menu";
import { getMoney } from "@/lib/display-currency";
import { SITE_NAME, siteUrl } from "@/lib/seo";
import { serverClock } from "@/lib/server-clock";
import { currentUser, unreadMessageCount } from "@/lib/supabase/server";
import "./globals.css";

// Geist draws Latin and Cyrillic. Arabic and Devanagari come from Noto Sans, which the browser
// downloads only for pages with those letters, so they are not preloaded.
const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const arabic = Noto_Sans_Arabic({ variable: "--font-arabic", preload: false });
const devanagari = Noto_Sans_Devanagari({ variable: "--font-devanagari", preload: false });

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("seo")]);
  const description = t("siteDescription");
  return {
    // Makes image and canonical addresses absolute.
    metadataBase: new URL(siteUrl()),
    // Every public page sets its own title; this one is for the rest, such as an unknown address.
    title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
    description,
    // Search results and AI answers may show large sharing images and quote as much as they need.
    // A page that sets its own robots, such as a noindex, replaces this.
    robots: { "max-image-preview": "large", "max-snippet": -1 },
    openGraph: {
      title: SITE_NAME,
      description,
      siteName: SITE_NAME,
      type: "website",
      locale: LOCALE_INFO[locale].og,
      alternateLocale: LOCALES.filter((other) => other !== locale).map((o) => LOCALE_INFO[o].og),
    },
    twitter: { card: "summary_large_image" },
  };
}
export const dynamic = "force-dynamic";
// `modal` is a dialog opened by a link inside the site, such as sign-in (`src/app/@modal`).
export default async function RootLayout({ children, modal }: LayoutProps<"/">) {
  const [user, nonce, clock, locale, money, t] = await Promise.all([
    currentUser(),
    // Set by the proxy together with the Content Security Policy.
    headers().then((list) => list.get("x-nonce") ?? undefined),
    serverClock(),
    getLocale(),
    getMoney(),
    getTranslations("chrome"),
  ]);
  const [account, unread] = user
    ? await Promise.all([accountMenu(), unreadMessageCount()])
    : [null, 0];
  const { lang, dir } = LOCALE_INFO[locale];
  return (
    <html
      lang={lang}
      dir={dir}
      className={`${sans.variable} ${mono.variable} ${arabic.variable} ${devanagari.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript nonce={nonce} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <ClientMessages namespaces={[]}>
          <MoneyProvider money={money}>
            <ServerClockProvider clock={clock}>
              <a
                className="fixed top-2 start-2 z-50 -translate-y-16 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:translate-y-0"
                href="#main"
              >
                {t("skipToContent")}
              </a>
              <SiteHeader account={account} unread={unread} currency={money.currency} />
              <main id="main" className="flex-1">
                {children}
              </main>
              <SiteFooter />
              {modal}
              <FeedbackButton />
              <PageViews />
              {/* Vercel sets VERCEL_ENV; local servers, tests and previews measure nothing. */}
              {process.env.VERCEL_ENV === "production" && <VercelAnalytics />}
            </ServerClockProvider>
          </MoneyProvider>
        </ClientMessages>
      </body>
    </html>
  );
}
