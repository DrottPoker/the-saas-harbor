import { Shell } from "@/components/shell";

export default function Loading() {
  return (
    <Shell>
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
    </Shell>
  );
}
