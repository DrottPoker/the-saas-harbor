import Link from "next/link";
import { LayoutDashboard, Plus } from "lucide-react";
import type { AccountMenuData } from "@/lib/account-menu";
import { providerList } from "@/lib/revenue/catalog";
import { AccountMenu } from "./account-menu";
import { FeedbackLink } from "./feedback-button";
import { Brand } from "./logo";
import { MessagesLink } from "./messages/messages-link";
import { Navigation } from "./navigation";
import { sections } from "./sections";
import { ThemeMenu } from "./theme-menu";
import { Button } from "./ui/button";

const quietLink = "text-sm text-muted-foreground transition-colors hover:text-foreground";
// Below md a signed-in header shows icons with 32 px targets, so everything fits on one line.
const iconLink = `${quietLink} inline-flex items-center justify-center gap-1.5 max-md:h-8 max-md:min-w-8`;

export function SiteHeader({
  account,
  unread,
}: {
  account: AccountMenuData | null;
  unread: number;
}) {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Brand compact={!!account} />
        <Navigation className="hidden md:flex" />
        <div className="ml-auto flex items-center gap-2 sm:gap-4">
          {/* On small screens the theme menu sits in the navigation row below. */}
          <ThemeMenu className="max-md:hidden" />
          {account ? (
            <>
              <MessagesLink userId={account.id} initialCount={unread} className={iconLink} />
              <Link className={iconLink} href="/dashboard">
                <LayoutDashboard aria-hidden="true" className="size-4 md:hidden" />
                <span className="max-md:sr-only">Dashboard</span>
              </Link>
            </>
          ) : (
            <Link className={`${quietLink} whitespace-nowrap`} href="/auth">
              Sign in
            </Link>
          )}
          {/* Visitors create an account first, so they go straight to sign-up. */}
          <Button asChild size="sm" className={account ? "max-sm:w-8 max-sm:px-0" : undefined}>
            <Link href={account ? "/dashboard/saas/new" : "/auth?mode=signup"}>
              <Plus className={account ? undefined : "max-sm:hidden"} />
              <span className={account ? "max-sm:sr-only" : undefined}>
                {/* The shorter label keeps a visitor's header on one line on the narrowest phones. */}
                List<span className={account ? undefined : "max-[359px]:hidden"}> your</span> SaaS
              </span>
            </Link>
          </Button>
          {account && <AccountMenu account={account} />}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t px-2.5 py-1.5 md:hidden">
        <Navigation className="flex min-w-0 overflow-x-auto" />
        <ThemeMenu className="ml-auto shrink-0" />
      </div>
    </header>
  );
}

// The footer's links, in groups.
const footerGroups: {
  title: string;
  links: readonly (readonly [href: string, label: string])[];
}[] = [
  {
    title: "Explore",
    links: [
      ...sections,
      ["/categories", "Categories"],
      ["/tech", "Tech stacks"],
      ["/stats", "Statistics"],
    ],
  },
  {
    title: "Get listed",
    links: [
      ["/list-your-saas", "List your SaaS"],
      ["/about", "How it works"],
      ["/where-to-launch", "Where to launch"],
    ],
  },
  {
    title: "About",
    links: [
      ["/feedback", "Send feedback"],
      ["/privacy", "Privacy"],
      ["/terms", "Terms"],
      // A plain text file, so a full page load rather than client navigation.
      ["/llms.txt", "For AI assistants"],
    ],
  },
];

export function SiteFooter({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className="mt-24 border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <Brand />
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            A free directory of independent SaaS products and the people who build them.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
          {footerGroups.map(({ title, links }) => (
            <div key={title}>
              <h2 className="text-[13px] font-medium text-foreground">{title}</h2>
              <ul className="mt-3 grid gap-2">
                {links.map(([href, label]) => (
                  <li key={href}>
                    {href === "/feedback" ? (
                      // Opens the form with the page the user is on.
                      <FeedbackLink signedIn={signedIn} className={quietLink}>
                        {label}
                      </FeedbackLink>
                    ) : href.endsWith(".txt") ? (
                      <a className={quietLink} href={href}>
                        {label}
                      </a>
                    ) : (
                      <Link className={quietLink} href={href}>
                        {label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <p className="border-t pt-6 text-[13px] text-faint-foreground lg:col-span-2">
          Revenue is verified through read-only connections to {providerList("and")}, and refreshed
          every hour.
        </p>
      </div>
    </footer>
  );
}
