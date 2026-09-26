"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["/admin", "Overview"],
  ["/admin/analytics", "Analytics"],
  ["/admin/reports", "Reports"],
  ["/admin/feedback", "Feedback"],
  ["/admin/products", "Products"],
  ["/admin/accounts", "Accounts"],
  ["/admin/log", "Log"],
] as const;

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Admin" className="-mx-1 flex gap-1 overflow-x-auto">
      {items.map(([href, label]) => {
        const current = href === "/admin" ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className="rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
