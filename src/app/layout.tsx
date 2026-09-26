import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { FeedbackButton } from "@/components/feedback-button";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { VercelAnalytics } from "@/components/vercel-analytics";
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/seo";
import { currentUser, unreadMessageCount } from "@/lib/supabase/server";
import { themeScript } from "@/lib/theme";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  // Makes image and canonical addresses absolute.
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${SITE_NAME} | Independent SaaS, ranked by revenue`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: `${SITE_NAME} | Independent SaaS, ranked by revenue`,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
};
export const dynamic = "force-dynamic";
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, nonce] = await Promise.all([
    currentUser(),
    // Set by the proxy together with the Content Security Policy.
    headers().then((list) => list.get("x-nonce") ?? undefined),
  ]);
  const unread = user ? await unreadMessageCount() : 0;
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Browsers hide nonce values from the DOM, so hydration would see a mismatch. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a
          className="fixed top-2 left-2 z-50 -translate-y-16 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:translate-y-0"
          href="#main"
        >
          Skip to content
        </a>
        <SiteHeader user={user} unread={unread} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <FeedbackButton />
        {/* Vercel sets VERCEL_ENV; local servers, tests and previews measure nothing. */}
        {process.env.VERCEL_ENV === "production" && <VercelAnalytics />}
      </body>
    </html>
  );
}
