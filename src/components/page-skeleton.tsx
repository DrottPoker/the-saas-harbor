import { Shell } from "@/components/shell";

/**
 * The placeholder that private areas show while their page loads. Public pages have none: they are
 * sent complete, so crawlers that do not run JavaScript read the content, and a missing page can
 * answer 404. `inShell` is for segments whose layout already draws the Shell.
 */
export function PageSkeleton({ inShell = false }: { inShell?: boolean }) {
  const placeholder = (
    <div role="status" className="animate-pulse">
      <span className="sr-only">Loading</span>
      <div className="h-9 w-80 max-w-full rounded-md bg-muted" />
      <div className="mt-4 h-5 w-96 max-w-full rounded-md bg-muted" />
      <div className="mt-10 grid gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-16 rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
  return inShell ? placeholder : <Shell>{placeholder}</Shell>;
}
