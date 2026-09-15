"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function Navigation() {
  const path = usePathname();
  return <nav className="main-nav" aria-label="Main navigation">{[["/", "Leaderboard"], ["/discover", "Discover"], ["/newest", "New arrivals"]].map(([href, label]) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>{label}</Link>)}</nav>;
}
