import { movingTodayCacheControl } from "@/lib/moving-today/cache";
import { getMovingToday } from "@/lib/moving-today/load";
import { emptyMovingToday } from "@/lib/moving-today/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Today's notable catalog sales. Cached for about 30 minutes.
 * Failures are held in memory for 60s and sent private, no-store.
 */
export async function GET() {
  try {
    const payload = await getMovingToday();
    return Response.json(payload, {
      headers: { "Cache-Control": movingTodayCacheControl() },
    });
  } catch (error) {
    console.warn(
      "[moving-today]",
      error instanceof Error ? error.message : "read failed",
    );
    return Response.json(emptyMovingToday(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
