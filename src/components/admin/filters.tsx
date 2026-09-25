import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldClasses } from "../ui/input";

/** Links that switch a list between filters, like the category filters in Browse. */
export function FilterTabs({
  label,
  current,
  options,
}: {
  label: string;
  current: string;
  options: { value: string; label: string; href: string }[];
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <Link
          key={option.value}
          href={option.href}
          aria-current={option.value === current ? "page" : undefined}
          className="shrink-0 rounded-full border bg-surface px-3 py-1 text-[13px] whitespace-nowrap text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:bg-foreground aria-[current=page]:text-background"
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

export function SearchForm({
  action,
  label,
  placeholder,
  value,
  hidden = {},
}: {
  action: string;
  label: string;
  placeholder: string;
  value: string;
  /** Filters to keep while searching. */
  hidden?: Record<string, string>;
}) {
  return (
    <form action={action} role="search" className="relative w-full sm:w-72">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint-foreground"
      />
      <input
        name="q"
        type="search"
        aria-label={label}
        placeholder={placeholder}
        defaultValue={value}
        maxLength={80}
        className={cn(fieldClasses, "h-9 pl-9")}
      />
      {Object.entries(hidden).map(([name, hiddenValue]) => (
        <input key={name} type="hidden" name={name} value={hiddenValue} />
      ))}
    </form>
  );
}
