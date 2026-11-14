import { consumeRateLimit } from "@/lib/comps/rate-limit";
import { createRateLimiter } from "@/lib/errors/report";
import { searchGiphy, type GifPage } from "@/lib/gifs/giphy";
import {
  getGifSearch,
  GIF_SEARCH_BUCKET,
  GIF_SEARCH_LIMIT,
  GIF_SEARCH_WINDOW_MS,
} from "@/lib/gifs/search-route";
import { getAuthUserId } from "@/lib/supabase/server";

/** GIF search for the post and reply composers. The GIPHY key is read here and nowhere else. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per server instance: at most 300 GIPHY calls a minute in all.
const global = createRateLimiter({ perKey: 300, total: 300, windowMs: 60_000 });
const cache = new Map<string, { at: number; page: GifPage }>();

export async function GET(request: Request) {
  return getGifSearch(request, {
    getUserId: getAuthUserId,
    apiKey: process.env.GIPHY_API_KEY?.trim() ?? "",
    consumeLimit: (userId) =>
      consumeRateLimit(userId, GIF_SEARCH_BUCKET, GIF_SEARCH_WINDOW_MS, GIF_SEARCH_LIMIT),
    consumeGlobal: () => global("giphy"),
    search: searchGiphy,
    cache,
    log: (line) => console.error(line),
  });
}
