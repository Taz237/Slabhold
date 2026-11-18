import { LB_CARD_BOTTOM, LB_CARD_TOP, LB_PAGE_BOTTOM, LB_PAGE_MID, LB_PAGE_TOP } from "@/lib/leaderboard/theme";

const PULSE = "skeleton-shimmer on-dark";

/** The leaderboard's own shape while it loads: header, week toggle, tabs, a podium and rows. */
export default function LeaderboardLoading() {
  return (
    <div
      className="-mx-4 -mt-5 min-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] px-4 pt-4 pb-8"
      style={{
        background: `linear-gradient(180deg, ${LB_PAGE_TOP} 0%, ${LB_PAGE_MID} 44%, ${LB_PAGE_BOTTOM} 100%)`,
        boxShadow: `0 16rem 0 0 ${LB_PAGE_BOTTOM}`,
      }}
      aria-busy="true"
      aria-label="Loading leaderboard"
      data-leaderboard-loading=""
    >
      <div className={`h-9 w-44 rounded-lg ${PULSE}`} />
      <div className={`mt-4 h-[52px] rounded-full ${PULSE}`} />
      <div className={`mt-2 h-14 rounded-2xl ${PULSE}`} />
      <div className="mt-4 grid grid-cols-3 gap-1">
        {[0, 1, 2].map((board) => (
          <div key={board} data-board-skeleton="" className={`h-14 rounded-xl ${PULSE}`} />
        ))}
      </div>
      <div
        className="mt-3 rounded-3xl border border-white/10 p-3"
        style={{ background: `linear-gradient(180deg, ${LB_CARD_TOP} 0%, ${LB_CARD_BOTTOM} 100%)` }}
      >
        <div className="grid grid-cols-3 items-end gap-2 pt-24">
          <div className={`h-[104px] rounded-xl ${PULSE}`} />
          <div className={`h-[132px] rounded-xl ${PULSE}`} />
          <div className={`h-[84px] rounded-xl ${PULSE}`} />
        </div>
        <div className="mt-4 space-y-1">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className={`h-14 rounded-xl ${PULSE}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
