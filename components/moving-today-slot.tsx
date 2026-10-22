import { connection } from "next/server";
import { MovingTodayPanel } from "@/components/moving-today";
import { getMovingToday } from "@/lib/moving-today/load";
import { shouldShowMovingToday } from "@/lib/moving-today/types";

/** Server render. The heading uses the request clock, not a cached label. */
export async function MovingTodaySlot() {
  await connection();
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
