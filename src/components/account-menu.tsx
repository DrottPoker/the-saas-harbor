"use client";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { ChevronDown, Flag, LogOut, Mail, Pencil, ShieldCheck, UserRound } from "lucide-react";
import { signOut } from "@/app/actions";
import type { AccountMenuData } from "@/lib/account-menu";
import { PersonAvatar } from "./avatars";

const item =
  "flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-muted [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground";

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <DropdownMenu.Item asChild className={item}>
      <Link href={href}>{children}</Link>
    </DropdownMenu.Item>
  );
}

/** The signed-in user's picture and name in the header, with their profile and account pages. */
export function AccountMenu({ account }: { account: AccountMenuData }) {
  const { name, slug, avatarPath, suspended, unfinished, sentReports, openReports } = account;
  return (
    // Not modal: a modal menu hides the rest of the page from screen readers while it is open.
    <DropdownMenu.Root modal={false}>
      {/* The name is the button's label; below xl only screen readers get it, so the header fits. */}
      <DropdownMenu.Trigger className="flex min-w-0 items-center gap-2 rounded-full text-sm text-muted-foreground transition-colors hover:text-foreground xl:py-0.5 xl:pr-2 xl:pl-0.5 xl:hover:bg-muted xl:data-[state=open]:bg-muted xl:data-[state=open]:text-foreground">
        <PersonAvatar path={avatarPath} name={name} size="sm" />
        <span className="max-w-36 truncate max-xl:sr-only">{name}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 max-xl:hidden" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-64 max-w-[calc(100vw-1rem)] rounded-lg border bg-surface p-1 text-foreground shadow-lg shadow-black/10"
        >
          <DropdownMenu.Label className="flex items-center gap-3 px-2 py-2">
            <PersonAvatar path={avatarPath} name={name} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{name}</span>
              {slug && (
                <span className="block truncate text-xs text-muted-foreground">@{slug}</span>
              )}
            </span>
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />
          {unfinished ? (
            <MenuLink href="/auth/finish">
              <UserRound />
              Choose your username
            </MenuLink>
          ) : (
            <>
              {slug && !suspended && (
                <MenuLink href={`/users/${slug}`}>
                  <UserRound />
                  Your profile
                </MenuLink>
              )}
              <MenuLink href="/dashboard/profile">
                <Pencil />
                Edit profile
              </MenuLink>
              <MenuLink href="/dashboard/settings">
                <Mail />
                Email settings
              </MenuLink>
              {sentReports && (
                <MenuLink href="/dashboard/reports">
                  <Flag />
                  Your reports
                </MenuLink>
              )}
              {openReports !== null && (
                <DropdownMenu.Item asChild className={item}>
                  <Link
                    href="/admin"
                    aria-label={
                      openReports
                        ? `Admin panel, ${openReports} open ${openReports === 1 ? "report" : "reports"}`
                        : "Admin panel"
                    }
                  >
                    <ShieldCheck />
                    Admin panel
                    {openReports > 0 && (
                      <span
                        aria-hidden="true"
                        className="ml-auto min-w-5 rounded-full bg-brand px-1.5 text-center text-xs leading-5 font-medium text-primary-foreground tabular-nums"
                      >
                        {openReports > 99 ? "99+" : openReports}
                      </span>
                    )}
                  </Link>
                </DropdownMenu.Item>
              )}
            </>
          )}
          <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />
          <form action={signOut}>
            {/* Closing the menu would remove the form before the click submits it. */}
            <DropdownMenu.Item
              asChild
              className={item}
              onSelect={(event) => event.preventDefault()}
            >
              <button type="submit">
                <LogOut />
                Sign out
              </button>
            </DropdownMenu.Item>
          </form>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
