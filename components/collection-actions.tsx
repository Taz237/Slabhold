"use client";

import { useState } from "react";
import { ChartNoAxesCombined, Share, Trophy } from "lucide-react";
import { CollectionSheet } from "@/components/collection-sheet";
import { PreviewThumb, ShareCollectionActions } from "@/components/invite/share-collection-card";
import { LeaderboardOptInSwitch, useLeaderboardNudge } from "@/components/leaderboard-opt-in";
import { useSocial } from "@/components/social-provider";
import type { LeaderboardMinimums } from "@/lib/leaderboard/eligibility";
import { collectionSharePath } from "@/lib/share/links";
import { getSupabaseConfig } from "@/lib/supabase/client";
import { pressTick } from "@/lib/ui/press-tick";

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
  if (!user) return null;
  return (
    <>
      <button
        type="button"
        aria-label="Share my collection"
        aria-haspopup="dialog"
        onClick={() => {
          pressTick();
          setOpen(true);
        }}
        className={headerIconButton}
      >
        <Share className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
      </button>
      {open ? (
        <CollectionSheet title="Share my collection" onClose={() => setOpen(false)}>
          <PreviewThumb src={`${collectionSharePath(user.username ?? "")}/opengraph-image`} />
          <div className="mt-3">
            <ShareCollectionActions />
          </div>
          {chart ? (
            <button
              type="button"
              onClick={chart.share}
              disabled={chart.sharing}
              aria-label="Share your collection chart"
              className="tap mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-zinc-300 px-4 text-14 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-60 dark:border-white/15"
            >
              <ChartNoAxesCombined aria-hidden className="h-4 w-4" />
              Share chart
            </button>
          ) : null}
          {chart?.failed ? (
            <p role="status" className="mt-2 text-center text-13 text-zinc-500">
              Couldn&apos;t open sharing. Try again.
            </p>
          ) : null}
        </CollectionSheet>
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
  if (!user || !getSupabaseConfig().configured) return null;
  return (
    <>
      <button
        type="button"
        aria-label={nudge.visible ? "Leaderboard settings. Your cards qualify." : "Leaderboard settings"}
        aria-haspopup="dialog"
        onClick={() => {
          pressTick();
          if (nudge.visible) nudge.dismiss();
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
      {open ? (
        <CollectionSheet title="Leaderboard" onClose={() => setOpen(false)}>
          <div className="pb-1">
            <LeaderboardOptInSwitch minimums={minimums} />
          </div>
        </CollectionSheet>
      ) : null}
    </>
  );
}
