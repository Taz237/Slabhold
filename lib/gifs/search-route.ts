import { alignedRetryAfterSeconds } from "@/lib/comps/rate-window";
import { cleanGifOffset, cleanGifQuery, type GifPage } from "./giphy";

/** GIF searches one account may run in a 10-minute window. */
export const GIF_SEARCH_LIMIT = 60;
export const GIF_SEARCH_WINDOW_MS = 10 * 60 * 1000;
export const GIF_SEARCH_BUCKET = "gif_search";

export const GIF_RATE_LIMIT_MESSAGE = "You're searching GIFs too quickly. Please wait a bit and try again.";
export const GIF_SEARCH_FAILED = "Couldn't load GIFs. Try again.";
export const GIFS_NOT_SET_UP = "GIFs aren't set up yet.";

/** How long the same search is answered from memory on this server instance. */
const CACHE_MS = 5 * 60 * 1000;
const CACHE_MAX = 200;

export type GifSearchDeps = {
  getUserId: () => Promise<string | null>;
  /** GIPHY_API_KEY. Empty when it is not set. */
  apiKey: string;
  /** False when this account is over its GIF search limit. */
  consumeLimit: (userId: string) => Promise<boolean>;
  /** False when this server instance has made too many GIPHY calls. */
  consumeGlobal: () => boolean;
  search: (input: { apiKey: string; query: string; offset: number; signal: AbortSignal }) => Promise<GifPage>;
  cache?: Map<string, { at: number; page: GifPage }>;
  now?: () => number;
  log?: (line: string) => void;
};

function limited(now: number): Response {
  return Response.json(
    { error: GIF_RATE_LIMIT_MESSAGE },
    { status: 429, headers: { "Retry-After": String(alignedRetryAfterSeconds(GIF_SEARCH_WINDOW_MS, now)) } },
  );
}

/**
 * GET /api/gifs/search?q=&offset= for the GIF picker. Signed-in only, rate
 * limited per account and per server instance, and answered from a short
 * cache so the same search does not call GIPHY twice. The key stays here.
 */
export async function getGifSearch(request: Request, deps: GifSearchDeps): Promise<Response> {
  const userId = await deps.getUserId();
  if (!userId) return Response.json({ error: "You need to be signed in." }, { status: 401 });
  if (!deps.apiKey) return Response.json({ error: GIFS_NOT_SET_UP }, { status: 503 });

  const params = new URL(request.url).searchParams;
  const query = cleanGifQuery(params.get("q"));
  const offset = cleanGifOffset(params.get("offset"));
  const now = (deps.now ?? Date.now)();

  if (!(await deps.consumeLimit(userId))) return limited(now);

  const headers = { "Cache-Control": "private, max-age=120" };
  const key = `${query.toLowerCase()}\n${offset}`;
  const hit = deps.cache?.get(key);
  if (hit && now - hit.at < CACHE_MS) return Response.json(hit.page, { headers });

  if (!deps.consumeGlobal()) return limited(now);

  try {
    const page = await deps.search({
      apiKey: deps.apiKey,
      query,
      offset,
      signal: AbortSignal.timeout(8000),
    });
    if (deps.cache) {
      if (deps.cache.size >= CACHE_MAX) deps.cache.clear();
      deps.cache.set(key, { at: now, page });
    }
    return Response.json(page, { headers });
  } catch (error) {
    // The message never includes the request URL, so the key cannot reach the logs.
    deps.log?.(`[gifs] search failed: ${error instanceof Error ? error.message : "unknown"}`);
    return Response.json({ error: GIF_SEARCH_FAILED }, { status: 502 });
  }
}
