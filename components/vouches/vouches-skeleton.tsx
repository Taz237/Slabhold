/** The vouches page's frame while it loads: header, summary card, tabs and a few rows. No client code. */
export function VouchRowsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, row) => (
        <div key={row} className="flex gap-3 border-b border-zinc-200 px-4 py-4 dark:border-white/10">
          <div className="h-10 w-10 shrink-0 skeleton-shimmer rounded-full" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <div className="h-3 w-32 skeleton-shimmer rounded-full" />
            <div className="h-3 w-full skeleton-shimmer rounded-full" />
            <div className="h-3 w-2/3 skeleton-shimmer rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function VouchSummarySkeleton() {
  return (
    <div aria-hidden="true" className="mx-4 mt-4 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
      <div className="h-10 w-20 skeleton-shimmer rounded-lg" />
      <div className="mt-4 h-2 skeleton-shimmer rounded-full" />
      <div className="mt-3 h-3 w-48 skeleton-shimmer rounded-full" />
      <div className="mt-2 h-3 w-28 skeleton-shimmer rounded-full" />
    </div>
  );
}

export function VouchesPageSkeleton() {
  return (
    <div className="-mx-4 -mt-5" role="status" aria-label="Loading vouches">
      <div className="flex h-[52px] items-center gap-2 border-b border-zinc-200 px-2 dark:border-white/10">
        <div className="h-9 w-9 skeleton-shimmer rounded-full" />
        <div className="space-y-1.5">
          <div className="h-4 w-24 skeleton-shimmer rounded-full" />
          <div className="h-3 w-16 skeleton-shimmer rounded-full" />
        </div>
      </div>
      <VouchSummarySkeleton />
      <div className="mt-4 h-11 border-b border-zinc-200 dark:border-white/10" />
      <VouchRowsSkeleton />
    </div>
  );
}
