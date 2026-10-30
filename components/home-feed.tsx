"use client";

import { FeedView } from "@/components/feed-view";
import { LeaderboardHomeLink } from "@/components/leaderboard-home-link";
import { MovingToday, MovingTodayCached } from "@/components/moving-today";
import type { MovingTodayPayload } from "@/lib/moving-today/types";

/** The timeline with the movers row the server cached. Loaded only for a signed-in reader. */
export function HomeFeed({ movers }: { movers: MovingTodayPayload | null }) {
  return (
    <FeedView
      movingToday={
        <>
          {movers ? <MovingTodayCached payload={movers} /> : <MovingToday />}
          <LeaderboardHomeLink />
        </>
      }
    />
  );
}
