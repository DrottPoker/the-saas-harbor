"use client";

import { useRef, type KeyboardEvent } from "react";
import { RANGES, type Range } from "@/lib/analytics-reports";
import { cn } from "@/lib/utils";

const segment =
  "rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-surface aria-pressed:text-foreground aria-pressed:shadow-sm";

/** Buttons that switch a card between periods, without leaving or scrolling the page. */
export function PeriodControl({
  label,
  value,
  onChange,
}: {
  label: string;
  /** Null when no single period applies, such as cards set to different ones. */
  value: Range | null;
  onChange: (range: Range) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex shrink-0 rounded-lg border bg-subtle p-0.5"
    >
      {RANGES.map((range) => (
        <button
          key={range.value}
          type="button"
          aria-pressed={value === range.value}
          aria-label={`${range.short}, ${range.label.toLowerCase()}`}
          title={range.label}
          onClick={() => onChange(range.value)}
          className={segment}
        >
          {range.short}
        </button>
      ))}
    </div>
  );
}

/** Tabs within a card. Arrow keys, Home and End move between them, as for any tab list. */
export function Tabs<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  function move(event: KeyboardEvent) {
    const index = options.findIndex((option) => option.value === value);
    const next = {
      ArrowRight: (index + 1) % options.length,
      ArrowLeft: (index - 1 + options.length) % options.length,
      Home: 0,
      End: options.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onChange(options[next].value);
    list.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
  }
  return (
    <div
      ref={list}
      role="tablist"
      aria-label={label}
      onKeyDown={move}
      className="flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--border)]"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            id={`${id}-tab-${option.value}`}
            aria-selected={selected}
            aria-controls={`${id}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "border-b-2 px-2 pt-1 pb-2 text-sm whitespace-nowrap transition-colors",
              selected
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** The panel a Tabs list controls. */
export function TabPanel({
  id,
  value,
  children,
}: {
  id: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${value}`} className="pt-4">
      {children}
    </div>
  );
}
