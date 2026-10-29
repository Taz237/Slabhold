const BAR = "rounded bg-zinc-200/80 dark:bg-white/[0.06]";

/**
 * The card page's boxes before data: back row, slab, title lines, chips and
 * the value card. Same sizes as the page, so the swap does not move anything.
 * loading.tsx, the page's own wait for the social store, and the shell's
 * tap-time skeleton (NavPendingSkeleton) all use it. Kept apart from the card
 * page so the shell can draw it without loading that page's code.
 */
export function PublicCardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" data-public-card-skeleton="">
      <span className="sr-only">Loading card</span>
      <div className="flex min-h-11 items-center gap-1.5" aria-hidden="true">
        <div className={`h-4 w-4 ${BAR}`} />
        <div className={`h-4 w-24 ${BAR}`} />
      </div>
      <div aria-hidden="true" className="skeleton-shimmer mx-auto h-96 w-64 rounded-2xl" />
      <div aria-hidden="true">
        <div className="flex h-5 items-center">
          <div className={`h-3.5 w-44 ${BAR}`} />
        </div>
        <div className="mt-1 flex h-9 items-center">
          <div className={`h-7 w-52 rounded-lg ${BAR}`} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[64, 56, 88].map((width) => (
            <div
              key={width}
              style={{ width }}
              className="h-[46px] rounded-full border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/5"
            />
          ))}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <div className="flex h-4 items-center">
          <div className={`h-2.5 w-24 ${BAR}`} />
        </div>
        <div className="mt-1 flex h-8 items-center">
          <div className={`h-6 w-28 rounded-md ${BAR}`} />
        </div>
      </div>
    </div>
  );
}
