import { cn } from "@/lib/utils";

const tones = {
  neutral: "text-muted-foreground",
  accent: "border-brand/50 text-brand",
  success: "border-success-border text-success",
  error: "border-error-border text-error",
} as const;

/** A small status label, such as Verified or Hidden. */
export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: keyof typeof tones;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
