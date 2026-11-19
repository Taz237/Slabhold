"use client";

import { useEffect, useState } from "react";
import { Share, Trophy } from "lucide-react";
import { useLeaderboardNudge } from "@/components/leaderboard-nudge";
import { SheetLoadFailed } from "@/components/part-load-failed";
import { useSocial } from "@/components/social-provider";
import type { LeaderboardMinimums } from "@/lib/leaderboard/eligibility";
import { getSupabaseConfig } from "@/lib/supabase/client";
import { afterFirstIdle } from "@/lib/ui/idle";
import { lazyPart } from "@/lib/ui/lazy-part";
import { pressTick } from "@/lib/ui/press-tick";

/*
 * Both sheets only draw after a tap, so each is its own chunk and Collection's
 * first load doesn't carry the share preview or the leaderboard switch. They
 * are fetched at the first idle moment, so they are in hand before the tap.
 */
const ShareSheet = lazyPart(
  () => import("@/components/collection-share-sheet-view").then((mod) => mod.CollectionShareSheetView),
  null,
  { name: "collection-share-sheet", failed: SheetLoadFailed },
);

const LeaderboardSheet = lazyPart(
  () => import("@/components/collection-leaderboard-sheet-view").then((mod) => mod.CollectionLeaderboardSheetView),
  null,
  { name: "collection-leaderboard-sheet", failed: SheetLoadFailed },
);

/** The hero's chart share, when the collection can be shared as a chart. */
export type ChartShare = { share: () => void; sharing: boolean; failed: boolean };

/** A 44px round control in the Collection header: quiet until pressed. */
export const headerIconButton =
  "tap relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-zinc-950/[0.05] text-zinc-700 outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:opacity-60 dark:bg-white/[0.07] dark:text-zinc-200";

/**
 * The one share control in the Collection hero. It opens Share, Post on X and
 * Save for Stories (the actions the old "Share my collection" card held), the
 * link preview, and the chart image when the collection is public.
 */
export function CollectionShareButton({ chart }: { chart: ChartShare | null }) {
  const { user } = useSocial();
  const [open, setOpen] = useState(false);
  const signedIn = Boolean(user);
  useEffect(() => {
    if (signedIn) return afterFirstIdle(ShareSheet.warm);
  }, [signedIn]);
  if (!user) return null;
  return (
    <>
      <button
        type="button"
        aria-label="Share my collection"
        aria-haspopup="dialog"
        onClick={() => {
          pressTick();
          ShareSheet.warm();
          setOpen(true);
        }}
        className={headerIconButton}
      >
        <Share className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
      </button>
      {open ? (
        <ShareSheet username={user.username ?? ""} chart={chart} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

/**
 * The leaderboard switch's home on Collection: a trophy in the header that
 * opens it in a sheet. The switch itself (and its saves) is the one in
 * Settings. A dot shows while the collection clears the board's minimums and
 * the switch is still off; opening the sheet clears it.
 */
export function LeaderboardSettingsButton({
  minimums,
  valuedCards,
  value,
  publicCollection,
  ready,
  accountCreatedAt,
}: {
  minimums: LeaderboardMinimums;
  valuedCards: number;
  value: number;
  publicCollection: boolean;
  ready: boolean;
  accountCreatedAt?: string | null;
}) {
  const { user } = useSocial();
  const [open, setOpen] = useState(false);
  const nudge = useLeaderboardNudge({ valuedCards, value, publicCollection, ready, minimums, accountCreatedAt });
  // Local accounts have no board to join.
  const shown = Boolean(user) && getSupabaseConfig().configured;
  useEffect(() => {
    if (shown) return afterFirstIdle(LeaderboardSheet.warm);
  }, [shown]);
  if (!user || !shown) return null;
  return (
    <>
      <button
        type="button"
        aria-label={nudge.visible ? "Leaderboard settings. Your cards qualify." : "Leaderboard settings"}
        aria-haspopup="dialog"
        onClick={() => {
          pressTick();
          if (nudge.visible) nudge.dismiss();
          LeaderboardSheet.warm();
          setOpen(true);
        }}
        className={headerIconButton}
      >
        <Trophy className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        {nudge.visible ? (
          <span
            aria-hidden
            data-slot="leaderboard-dot"
            className="absolute top-2 right-2 h-2 w-2 rounded-full bg-violet-500 ring-2 ring-[var(--background)]"
          />
        ) : null}
      </button>
      {open ? <LeaderboardSheet minimums={minimums} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
