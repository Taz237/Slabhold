import { MovingTodayPanel } from "@/components/moving-today";
import { getMovingToday } from "@/lib/moving-today/load";
import { shouldShowMovingToday } from "@/lib/moving-today/types";

/** Server render so a day with sales already occupies its height. */
export async function MovingTodaySlot() {
  let payload;
  try {
    payload = await getMovingToday();
  } catch {
    return null;
  }
  if (!shouldShowMovingToday(payload.sales)) return null;
  return (
    <MovingTodayPanel heading={payload.title} dateLabel={payload.dateLabel} sales={payload.sales} />
  );
}
