import { LeaderboardHomeLink } from "@/components/leaderboard-home-link";
import { MovingToday, MovingTodayCached } from "@/components/moving-today";
import { getMovingToday } from "@/lib/moving-today/load";
import type { MovingTodayPayload } from "@/lib/moving-today/types";

/** Cached sales for Home. The heading is the one the server computed. */
export async function MovingTodaySlot() {
  let payload: MovingTodayPayload | null = null;
  try {
    payload = await getMovingToday();
  } catch {
    payload = null;
  }
  return (
    <>
      {payload ? <MovingTodayCached payload={payload} /> : <MovingToday />}
      <LeaderboardHomeLink />
    </>
  );
}
