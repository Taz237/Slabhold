"use client";

import { FeedView } from "@/components/feed-view";
import { LeaderboardHomeLink } from "@/components/leaderboard-home-link";
import { MovingToday, MovingTodayCached } from "@/components/moving-today";
import { SeededSocial } from "@/components/social-seed";
import type { HomeSeed } from "@/lib/social/home-seed";
import type { MovingTodayPayload } from "@/lib/moving-today/types";

/**
 * The timeline with the movers row the server cached. Loaded only for a
 * signed-in reader. Always inside SeededSocial, seed or not, so it is one
 * tree that never remounts.
 */
export function HomeFeed({
  movers,
  seed = null,
}: {
  movers: MovingTodayPayload | null;
  seed?: HomeSeed | null;
}) {
  return (
    <SeededSocial seed={seed}>
      <FeedView
        seed={seed}
        movingToday={
          <>
            {movers ? <MovingTodayCached payload={movers} /> : <MovingToday />}
            <LeaderboardHomeLink />
          </>
        }
      />
    </SeededSocial>
  );
}
