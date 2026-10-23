export default function LeaderboardLoading() {
  return (
    <div className="-mx-4 -mt-5" aria-busy="true" data-leaderboard-loading="">
      <div className="border-b border-zinc-200 px-4 py-4 dark:border-white/10">
        <div className="h-8 w-40 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
      </div>
      <div className="grid grid-cols-2 border-b border-zinc-200 dark:border-white/10">
        <div className="min-h-11" />
        <div className="min-h-11" />
      </div>
      <div className="flex gap-2 px-4 py-3">
        <div className="h-11 w-32 animate-pulse rounded-full bg-zinc-200 dark:bg-white/10" />
        <div className="h-11 w-36 animate-pulse rounded-full bg-zinc-200 dark:bg-white/10" />
      </div>
    </div>
  );
}
