/** The value board's own boxes: title, week line, then a bracket of rows. */
export default function ValueLeaderboardLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the value board</span>
      <div>
        <div className="skeleton-shimmer h-8 w-28 rounded-lg" />
        <div className="skeleton-shimmer mt-2 h-4 w-44 rounded-full" />
      </div>
      {[0, 1].map((bracket) => (
        <div key={bracket} className="space-y-2">
          <div className="skeleton-shimmer h-4 w-32 rounded-full" />
          <div className="divide-y divide-zinc-200 rounded-3xl border border-zinc-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-white/[0.03]">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex min-h-11 items-center gap-3 px-3 py-2">
                <div className="skeleton-shimmer h-4 w-4 shrink-0 rounded" />
                <div className="skeleton-shimmer h-9 w-9 shrink-0 rounded-full" />
                <div className="skeleton-shimmer h-3.5 w-28 rounded-full" />
                <div className="skeleton-shimmer ml-auto h-3.5 w-12 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
