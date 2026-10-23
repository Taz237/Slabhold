import { trendingCacheControl } from "@/lib/social/trending";
import { getTrendingNow } from "@/lib/social/trending-load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public ranking for the For You strip.
 * The handler can run often; getTrendingNow keeps the queries on a five-minute cache.
 * Failures are not stored.
 */
export async function GET() {
  try {
    const items = await getTrendingNow();
    return Response.json({ items }, { headers: { "Cache-Control": trendingCacheControl() } });
  } catch (error) {
    console.warn("[trending-now]", error instanceof Error ? error.message : "read failed");
    return Response.json({ items: [] }, { headers: { "Cache-Control": "private, no-store" } });
  }
}
