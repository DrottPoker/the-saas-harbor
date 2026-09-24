import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { currentUser, unreadMessageCount } from "@/lib/supabase/server";
import { themeScript } from "@/lib/theme";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: {
    default: "The SaaS Harbor | Independent SaaS, ranked by revenue",
    template: "%s | The SaaS Harbor",
  },
  description:
    "A public directory of independent SaaS products, with a leaderboard of monthly recurring revenue verified through Stripe.",
};
export const dynamic = "force-dynamic";
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const unread = user ? await unreadMessageCount() : 0;
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
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
      </body>
    </html>
  );
}
