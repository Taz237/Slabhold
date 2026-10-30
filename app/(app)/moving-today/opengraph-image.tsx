import { ogContentType, ogSize, renderMovingTodayOg } from "@/components/og-frame";
import { getMovingToday } from "@/lib/moving-today/load";
import { movingTodayShareModel } from "@/lib/moving-today/share";
import { emptyMovingToday, MOVING_TODAY_TITLE } from "@/lib/moving-today/types";

export const alt = MOVING_TODAY_TITLE;
export const size = ogSize;
export const contentType = ogContentType;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Image() {
  let payload = emptyMovingToday();
  try {
    payload = await getMovingToday();
  } catch {
    payload = emptyMovingToday();
  }
  return renderMovingTodayOg(movingTodayShareModel(payload));
}
