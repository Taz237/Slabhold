import { MovingToday, MovingTodayCached } from "@/components/moving-today";
import { getMovingToday } from "@/lib/moving-today/load";
import type { MovingTodayPayload } from "@/lib/moving-today/types";

/** Cached sales for Home. The client chooses the heading when it renders. */
export async function MovingTodaySlot() {
  let payload: MovingTodayPayload | null = null;
  try {
    payload = await getMovingToday();
  } catch {
    payload = null;
  }
  if (!payload) return <MovingToday />;
  return <MovingTodayCached payload={payload} />;
}
