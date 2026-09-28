/** The conversation list while it loads. */
export function ConversationListSkeleton() {
  return (
    <div role="status" className="animate-pulse">
      <span className="sr-only">Loading</span>
      <div className="flex min-h-14 items-center border-b px-4">
        <div className="h-5 w-28 rounded-md bg-muted" />
      </div>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="size-10 shrink-0 rounded-full bg-muted" />
          <div className="grid flex-1 gap-2">
            <div className="h-4 w-32 rounded-md bg-muted" />
            <div className="h-4 w-44 max-w-full rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The open conversation while it loads. */
export function ConversationSkeleton() {
  return (
    <div role="status" className="flex flex-1 animate-pulse flex-col">
      <span className="sr-only">Loading</span>
      <div className="flex min-h-14 items-center gap-3 border-b px-4">
        <div className="size-8 rounded-full bg-muted" />
        <div className="h-5 w-40 rounded-md bg-muted" />
      </div>
      <div className="grid flex-1 content-end gap-3 p-4 sm:p-5">
        <div className="h-9 w-2/3 rounded-2xl bg-muted" />
        <div className="h-9 w-1/2 justify-self-end rounded-2xl bg-muted" />
        <div className="h-9 w-3/5 rounded-2xl bg-muted" />
      </div>
      <div className="border-t p-3 sm:p-4">
        <div className="h-10 rounded-md bg-muted" />
      </div>
    </div>
  );
}
