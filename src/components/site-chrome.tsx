import Link from "next/link";
import { Plus } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { signOut } from "@/app/actions";
import { Brand } from "./logo";
import { Navigation } from "./navigation";
import { sections } from "./sections";
import { ThemeMenu } from "./theme-menu";
import { Button } from "./ui/button";

const quietLink = "text-sm text-muted-foreground transition-colors hover:text-foreground";

export function SiteHeader({ user }: { user: User | null }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Brand />
        <Navigation className="hidden md:flex" />
        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          {/* On small screens the theme menu sits in the navigation row below. */}
          <ThemeMenu className="max-md:hidden" />
          {user ? (
            <>
              <Link className={quietLink} href="/dashboard">
                Dashboard
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
          <Button asChild size="sm">
            <Link href="/dashboard/saas/new">
              <Plus className="max-sm:hidden" />
              Submit SaaS
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
          <Link className={quietLink} href="/about">
            How it works
          </Link>
        </nav>
        <p className="text-[13px] text-faint-foreground sm:col-span-2">
          Revenue is verified through read-only Stripe connections and refreshed daily.
        </p>
      </div>
    </footer>
  );
}
