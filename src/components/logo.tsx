import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-6 shrink-0", className)}>
      <rect width="24" height="24" rx="6" fill="currentColor" />
      <g fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="6.6" r="1.9" />
        <path d="M12 8.5v10M8.8 11.3h6.4M6.4 14.2a5.6 5.6 0 0 0 11.2 0" />
      </g>
    </svg>
  );
}

export function Brand() {
  return (
    <Link
      href="/"
      className="flex shrink-0 items-center gap-2 text-[15px] font-semibold tracking-tight"
    >
      <LogoMark className="text-brand" />
      The SaaS Harbor
    </Link>
  );
}
