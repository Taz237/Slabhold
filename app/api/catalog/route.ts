import { readCatalogPage } from "@/lib/public-catalog/load";
import { CATALOG_CACHE_CONTROL, parseCatalogFilters, parseCatalogOffset } from "@/lib/public-catalog/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One page of public cards: ?sport=&sort=&q=&offset=. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const filters = parseCatalogFilters({
    sport: params.get("sport"),
    sort: params.get("sort"),
    q: params.get("q"),
  });
  try {
    const page = await readCatalogPage(filters, parseCatalogOffset(params.get("offset")));
    return Response.json(page, { headers: { "Cache-Control": CATALOG_CACHE_CONTROL } });
  } catch (error) {
    console.warn("[catalog]", error instanceof Error ? error.message : "read failed");
    return Response.json({ error: "Couldn't load cards" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
