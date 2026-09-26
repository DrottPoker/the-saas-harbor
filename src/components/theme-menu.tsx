"use client";
import { useLayoutEffect, useState } from "react";
import { DropdownMenu } from "radix-ui";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const options = [
  ["light", "Light", Sun],
  ["dark", "Dark", Moon],
  ["system", "System", Monitor],
] as const;

function savedTheme(): Theme {
  const match = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=(light|dark)(?:;|$)`));
  return (match?.[1] as Theme | undefined) ?? "system";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
    document.cookie = `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } else {
    root.setAttribute("data-theme", theme);
    document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
  }
}

export function ThemeMenu({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("system");

  // React clears attributes set by the inline script when it draws the page itself: a dev remount,
  // or a missing page, whose HTML is Next.js's bare error document. Re-apply before paint.
  useLayoutEffect(() => {
    const saved = savedTheme();
    if (saved !== "system") document.documentElement.setAttribute("data-theme", saved);
  }, []);

  return (
    <DropdownMenu.Root onOpenChange={(open) => open && setTheme(savedTheme())}>
      <DropdownMenu.Trigger
        aria-label="Theme"
        className={cn(
          "inline-grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted",
          className,
        )}
      >
        {/* The icon follows the resolved theme through CSS, so server and client render the same. */}
        <Sun className="size-4 dark:hidden" />
        <Moon className="hidden size-4 dark:block" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-36 rounded-lg border bg-surface p-1 text-foreground shadow-lg shadow-black/10"
        >
          <DropdownMenu.RadioGroup
            value={theme}
            onValueChange={(value) => {
              setTheme(value as Theme);
              applyTheme(value as Theme);
            }}
          >
            {options.map(([value, label, Icon]) => (
              <DropdownMenu.RadioItem
                key={value}
                value={value}
                className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-muted"
              >
                <Icon className="size-4 text-muted-foreground" />
                {label}
                <DropdownMenu.ItemIndicator className="ml-auto pl-3">
                  <Check className="size-4" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
