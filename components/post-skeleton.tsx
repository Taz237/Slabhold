/** Small on purpose: Home's timeline fallback loads it before the feed's own chunk. */

/** One post-shaped placeholder: avatar, name, text lines, and an optional 5:7 card. */
export function PostSkeleton({ withCard = false }: { withCard?: boolean }) {
  return (
    <div data-post-skeleton="" className="flex gap-3 border-b border-zinc-200/70 px-4 py-4 dark:border-white/[0.07]">
      <div className="skeleton-shimmer h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center gap-2">
          <div className="skeleton-shimmer h-3.5 w-24 rounded-full" />
          <div className="skeleton-shimmer h-3 w-16 rounded-full opacity-70" />
        </div>
        <div className="mt-3 space-y-2">
          <div className="skeleton-shimmer h-3 w-full rounded-full" />
          <div className="skeleton-shimmer h-3 w-4/5 rounded-full" />
        </div>
        {withCard ? (
          <div className="mx-auto mt-4 w-[60%] max-w-[260px]">
            <div className="skeleton-shimmer aspect-[5/7] w-full rounded-xl" />
            <div className="skeleton-shimmer mt-2.5 h-3 w-3/4 rounded-full" />
          </div>
        ) : null}
        <div className="mt-4 flex justify-between pr-8">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="skeleton-shimmer h-4 w-8 rounded-full opacity-60" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading timeline</span>
      <div className="grid grid-cols-2 border-b border-zinc-200/70 dark:border-white/[0.07]">
        <div className="flex min-h-12 items-center justify-center">
          <div className="skeleton-shimmer h-3 w-16 rounded-full" />
        </div>
        <div className="flex min-h-12 items-center justify-center">
          <div className="skeleton-shimmer h-3 w-20 rounded-full opacity-70" />
        </div>
      </div>
      <PostSkeleton />
      <PostSkeleton withCard />
      <PostSkeleton />
    </div>
  );
}
