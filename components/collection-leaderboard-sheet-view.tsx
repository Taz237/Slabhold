"use client";

import { CollectionSheet } from "@/components/collection-sheet";
import { LeaderboardOptInSwitch } from "@/components/leaderboard-opt-in";
import type { LeaderboardMinimums } from "@/lib/leaderboard/eligibility";

/**
 * What Collection's trophy opens: the same leaderboard switch as Settings, in
 * a sheet. Its own chunk, fetched ahead of the tap (components/collection-actions.tsx).
 */
export function CollectionLeaderboardSheetView({
  minimums,
  onClose,
}: {
  minimums: LeaderboardMinimums;
  onClose: () => void;
}) {
  return (
    <CollectionSheet title="Leaderboard" onClose={onClose}>
      <div className="pb-1">
        <LeaderboardOptInSwitch minimums={minimums} />
      </div>
    </CollectionSheet>
  );
}
