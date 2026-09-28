import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { FeedbackButton } from "@/components/feedback-button";
import { PageViews } from "@/components/page-views";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ThemeScript } from "@/components/theme-script";
import { VercelAnalytics } from "@/components/vercel-analytics";
import { accountMenu } from "@/lib/account-menu";
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/seo";
import { currentUser, unreadMessageCount } from "@/lib/supabase/server";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  // Makes image and canonical addresses absolute.
  metadataBase: new URL(siteUrl()),
  // Every public page sets its own title; this one is for the rest, such as an unknown address.
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  // Search results and AI answers may show large sharing images and quote as much as they need.
  // A page that sets its own robots, such as a noindex, replaces this.
  robots: { "max-image-preview": "large", "max-snippet": -1 },
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
};
export const dynamic = "force-dynamic";
// `modal` is a dialog opened by a link inside the site, such as sign-in (`src/app/@modal`).
export default async function RootLayout({ children, modal }: LayoutProps<"/">) {
  const [user, nonce] = await Promise.all([
    currentUser(),
    // Set by the proxy together with the Content Security Policy.
    headers().then((list) => list.get("x-nonce") ?? undefined),
  ]);
  const [account, unread] = user
    ? await Promise.all([accountMenu(), unreadMessageCount()])
    : [null, 0];
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <ThemeScript nonce={nonce} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a
          className="fixed top-2 left-2 z-50 -translate-y-16 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:translate-y-0"
          href="#main"
        >
          Skip to content
        </a>
        <SiteHeader account={account} unread={unread} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter signedIn={!!user} />
        {modal}
        <FeedbackButton signedIn={!!user} />
        <PageViews />
        {/* Vercel sets VERCEL_ENV; local servers, tests and previews measure nothing. */}
        {process.env.VERCEL_ENV === "production" && <VercelAnalytics />}
      </body>
    </html>
  );
}
