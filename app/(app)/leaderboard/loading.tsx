const PULSE = "animate-pulse bg-white/[0.07] motion-reduce:animate-none";

export default function LeaderboardLoading() {
  return (
    <div className="-mx-4 -mt-5 bg-zinc-950" aria-busy="true" aria-label="Loading leaderboard" data-leaderboard-loading="">
      <div className="px-4 pt-4 pb-3">
        <div className={`h-8 w-40 rounded-lg ${PULSE}`} />
        <div className={`mt-2 h-4 w-64 max-w-full rounded ${PULSE}`} />
        <div className={`mt-3 h-5 w-48 rounded-full ${PULSE}`} />
      </div>
      <div className={`mx-4 h-[52px] rounded-full ${PULSE}`} />
      <div className={`mx-4 mt-4 mb-3 h-3 w-56 rounded ${PULSE}`} />
      <div className="space-y-4 px-3 pt-2 pb-8">
        {[0, 1, 2].map((board) => (
          <div key={board} data-board-skeleton="" className="rounded-3xl border border-white/10 bg-zinc-950 px-3 pb-3">
            <div className="flex items-start gap-3 px-1 pt-4 pb-3">
              <div className={`h-10 w-10 shrink-0 rounded-xl ${PULSE}`} />
              <div className="min-w-0 flex-1">
                <div className={`h-4 w-36 rounded ${PULSE}`} />
                <div className={`mt-2 h-3 w-52 max-w-full rounded ${PULSE}`} />
              </div>
            </div>
            <div className="space-y-2">
              {[0, 1, 2].map((row) => (
                <div key={row} className={`h-[72px] rounded-2xl ${PULSE}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
