import Link from "next/link";
import { LayoutDashboard, Plus } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { signOut } from "@/app/actions";
import { Brand } from "./logo";
import { MessagesLink } from "./messages/messages-link";
import { Navigation } from "./navigation";
import { sections } from "./sections";
import { ThemeMenu } from "./theme-menu";
import { Button } from "./ui/button";

const quietLink = "text-sm text-muted-foreground transition-colors hover:text-foreground";
// Below md a signed-in header shows icons with 32 px targets, so everything fits on one line.
const iconLink = `${quietLink} inline-flex items-center justify-center gap-1.5 max-md:h-8 max-md:min-w-8`;

export function SiteHeader({ user, unread }: { user: User | null; unread: number }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Brand compact={!!user} />
        <Navigation className="hidden md:flex" />
        <div className="ml-auto flex items-center gap-2 sm:gap-4">
          {/* On small screens the theme menu sits in the navigation row below. */}
          <ThemeMenu className="max-md:hidden" />
          {user ? (
            <>
              <MessagesLink userId={user.id} initialCount={unread} className={iconLink} />
              <Link className={iconLink} href="/dashboard">
                <LayoutDashboard aria-hidden="true" className="size-4 md:hidden" />
                <span className="max-md:sr-only">Dashboard</span>
              </Link>
              {/* On small screens sign-out lives on the dashboard to keep the header on one line. */}
              <form action={signOut} className="hidden md:block">
                <button className={quietLink} type="submit">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link className={quietLink} href="/auth">
              Sign in
            </Link>
          )}
          <Button asChild size="sm" className={user ? "max-sm:w-8 max-sm:px-0" : undefined}>
            <Link href="/dashboard/saas/new">
              <Plus className={user ? undefined : "max-sm:hidden"} />
              <span className={user ? "max-sm:sr-only" : undefined}>Submit SaaS</span>
            </Link>
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t px-2.5 py-1.5 md:hidden">
        <Navigation className="flex min-w-0 overflow-x-auto" />
        <ThemeMenu className="ml-auto shrink-0" />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1fr_auto] sm:px-6">
        <div>
          <Brand />
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            A public directory of independent SaaS products and the people who build them.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 sm:justify-end">
          {sections.map(([href, label]) => (
            <Link key={href} className={quietLink} href={href}>
              {label}
            </Link>
          ))}
          <Link className={quietLink} href="/categories">
            Categories
          </Link>
          <Link className={quietLink} href="/about">
            How it works
          </Link>
          <Link className={quietLink} href="/privacy">
            Privacy
          </Link>
          <Link className={quietLink} href="/terms">
            Terms
          </Link>
          <a className={quietLink} href="/llms.txt">
            For AI assistants
          </a>
        </nav>
        <p className="text-[13px] text-faint-foreground sm:col-span-2">
          Revenue is verified through read-only Stripe connections and refreshed daily.
        </p>
      </div>
    </footer>
  );
}
