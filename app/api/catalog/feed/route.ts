import { readFeedPage } from "@/lib/catalog-feed/load";
import { parseFeedFilters } from "@/lib/catalog-feed/feed";
import { CATALOG_CACHE_CONTROL, parseCatalogOffset } from "@/lib/public-catalog/query";
import { getAuthUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE = "private, no-store";

/**
 * One page of the Catalog feed: ?tab=&sport=&offset=. For You is the same
 * for everyone (public cards only), so it caches at the edge. Following
 * reads who the viewer follows, so it never caches.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const filters = parseFeedFilters({ tab: params.get("tab"), sport: params.get("sport") });
  const following = filters.tab === "following";
  try {
    const viewerId = following ? await getAuthUserId().catch(() => null) : null;
    const page = await readFeedPage(filters, parseCatalogOffset(params.get("offset")), viewerId);
    return Response.json(page, { headers: { "Cache-Control": following ? PRIVATE : CATALOG_CACHE_CONTROL } });
  } catch (error) {
    console.warn("[catalog-feed]", error instanceof Error ? error.message : "read failed");
    return Response.json({ error: "Couldn't load cards" }, { status: 503, headers: { "Cache-Control": PRIVATE } });
  }
}
