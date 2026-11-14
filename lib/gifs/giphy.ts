import { gifFromGiphy, type PostGif } from "@/lib/social/gifs";

/** GIFs per page in the picker. */
export const GIF_PAGE_SIZE = 24;
/** Words in the search box are cut to this. */
export const GIF_QUERY_MAX = 50;
/** Paging stops here. GIPHY does not serve past a few thousand anyway. */
export const GIF_OFFSET_MAX = 480;

const ENDPOINT = "https://api.giphy.com/v1/gifs";

export type GifPage = { gifs: PostGif[]; nextOffset: number | null };

export function cleanGifQuery(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, GIF_QUERY_MAX);
}

export function cleanGifOffset(value: unknown): number {
  const number = typeof value === "string" && /^\d{1,4}$/.test(value) ? Number(value) : 0;
  return Math.min(GIF_OFFSET_MAX, Math.floor(number / GIF_PAGE_SIZE) * GIF_PAGE_SIZE);
}

/**
 * One page of GIFs from GIPHY: a search, or what is trending when there is
 * no search. Runs on the server only, so the key never reaches a browser.
 * Rated PG, so the picker stays safe for a hobby feed.
 */
export async function searchGiphy(input: {
  apiKey: string;
  query: string;
  offset: number;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}): Promise<GifPage> {
  const params = new URLSearchParams({
    api_key: input.apiKey,
    limit: String(GIF_PAGE_SIZE),
    offset: String(input.offset),
    rating: "pg",
    bundle: "messaging_non_clips",
  });
  if (input.query) {
    params.set("q", input.query);
    params.set("lang", "en");
  }
  const url = `${ENDPOINT}/${input.query ? "search" : "trending"}?${params.toString()}`;
  const response = await (input.fetch ?? fetch)(url, {
    signal: input.signal,
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  // Never put the response or the URL in an error: the URL carries the key.
  if (!response.ok) throw new Error(`GIPHY answered ${response.status}`);
  const body = (await response.json()) as { data?: unknown; pagination?: { total_count?: unknown } };
  const items = Array.isArray(body.data) ? body.data : [];
  const gifs: PostGif[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const gif = gifFromGiphy(item);
    if (!gif || seen.has(gif.id)) continue;
    seen.add(gif.id);
    gifs.push(gif);
  }
  const total = typeof body.pagination?.total_count === "number" ? body.pagination.total_count : 0;
  const next = input.offset + GIF_PAGE_SIZE;
  const more = items.length === GIF_PAGE_SIZE && next < total && next <= GIF_OFFSET_MAX;
  return { gifs, nextOffset: more ? next : null };
}
