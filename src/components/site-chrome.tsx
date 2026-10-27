import Link from "@/components/link";
import { Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { Currency } from "@/i18n/currencies";
import { formatList } from "@/i18n/list";
import type { AccountMenuData } from "@/lib/account-menu";
import { availableProviders } from "@/lib/revenue/available";
import { providerNames } from "@/lib/revenue/catalog";
import { AccountMenu } from "./account-menu";
import { FeedbackLink } from "./feedback-button";
import { Brand } from "./logo";
import { MessagesLink } from "./messages/messages-link";
import { Navigation } from "./navigation";
import { PreferencesMenu } from "./preferences-menu";
import { ThemeMenu } from "./theme-menu";
import { Button } from "./ui/button";

const quietLink = "text-sm text-muted-foreground transition-colors hover:text-foreground";
// Below md a signed-in header shows icons with 32 px targets, so everything fits on one line; the
// dashboard is in the account menu there.
const iconLink = `${quietLink} inline-flex items-center justify-center gap-1.5 max-md:h-8 max-md:min-w-8`;

export async function SiteHeader({
  account,
  unread,
  currency,
}: {
  account: AccountMenuData | null;
  unread: number;
  currency: Currency;
}) {
  const t = await getTranslations("chrome.header");
  // Language, currency and theme sit at the top right; on small screens in the row below.
  const settings = (className: string) => (
    <div className={`flex shrink-0 items-center gap-1 ${className}`}>
      <PreferencesMenu currency={currency} signedIn={!!account} />
      <ThemeMenu />
    </div>
  );
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Brand compact={!!account} />
        <Navigation className="hidden md:flex" />
        <div className="ms-auto flex items-center gap-2 sm:gap-4">
          {settings("max-md:hidden")}
          {account ? (
            <>
              <MessagesLink userId={account.id} initialCount={unread} className={iconLink} />
              {/* Phones reach the dashboard from the account menu, where it has its name. */}
              <Link className={`${quietLink} max-md:hidden`} href="/dashboard">
                {t("dashboard")}
              </Link>
            </>
          ) : (
            <Link className={`${quietLink} whitespace-nowrap`} href="/auth">
              {t("signIn")}
            </Link>
          )}
          {/* Visitors create an account first, so they go straight to sign-up. */}
          <Button asChild size="sm" className={account ? "max-sm:w-8 max-sm:px-0" : undefined}>
            <Link href={account ? "/dashboard/saas/new" : "/auth?mode=signup"}>
              <Plus className={account ? undefined : "max-sm:hidden"} />
              {account ? (
                <span className="max-sm:sr-only">{t("addSaas")}</span>
              ) : (
                <>
                  {/* The shorter label keeps the header on one line on the narrowest phones. */}
                  <span className="max-[359px]:hidden">{t("listYourSaas")}</span>
                  <span className="min-[360px]:hidden">{t("listSaasShort")}</span>
                </>
              )}
            </Link>
          </Button>
          {account && <AccountMenu account={account} />}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t px-2.5 py-1.5 md:hidden">
        <Navigation className="flex min-w-0 overflow-x-auto" />
        {settings("ms-auto")}
      </div>
    </header>
  );
}

// The footer's links, in groups, as message keys in chrome.footer.
const footerGroups = [
  {
    title: "explore",
    links: [
      ["/", "leaderboard"],
      ["/browse", "browse"],
      ["/newest", "newArrivals"],
      ["/categories", "categories"],
      ["/tech", "techStacks"],
      ["/stats", "statistics"],
    ],
  },
  {
    title: "getListed",
    links: [
      ["/list-your-saas", "listYourSaas"],
      ["/about", "howItWorks"],
      ["/where-to-launch", "whereToLaunch"],
    ],
  },
  {
    title: "about",
    links: [
      ["/feedback", "sendFeedback"],
      ["/privacy", "privacy"],
      ["/terms", "terms"],
      // A plain text file, so a full page load rather than client navigation.
      ["/llms.txt", "forAiAssistants"],
    ],
  },
] as const;

export async function SiteFooter() {
  const [t, nav, locale] = await Promise.all([
    getTranslations("chrome.footer"),
    getTranslations("chrome.nav"),
    getLocale(),
  ]);
  const label = (key: (typeof footerGroups)[number]["links"][number][1]) =>
    key === "leaderboard" || key === "browse" ? nav(key) : t(key);
  return (
    <footer className="mt-24 border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <Brand />
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">{t("tagline")}</p>
        </div>
        <nav aria-label={t("label")} className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
          {footerGroups.map(({ title, links }) => (
            <div key={title}>
              <h2 className="text-[13px] font-medium text-foreground">{t(title)}</h2>
              <ul className="mt-3 grid gap-2">
                {links.map(([href, key]) => (
                  <li key={href}>
                    {href === "/feedback" ? (
                      // Opens the form with the page the user is on.
                      <FeedbackLink className={quietLink}>{label(key)}</FeedbackLink>
                    ) : href.endsWith(".txt") ? (
                      <a className={quietLink} href={href}>
                        {label(key)}
                      </a>
                    ) : (
                      <Link className={quietLink} href={href}>
                        {label(key)}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <p className="border-t pt-6 text-[13px] text-faint-foreground lg:col-span-2">
          {t("providers", {
            providers: formatList(providerNames(availableProviders()), locale),
          })}
        </p>
      </div>
    </footer>
  );
}
