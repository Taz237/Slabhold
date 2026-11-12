import type { SoldTitle } from "./match";

/**
 * Cached eBay sold listings, searched by the player a scan read. Client-safe
 * helpers only: the read itself is lib/scan/sold-titles-server.ts, from
 * sold_comps_cache (what card pages already saved via Trawl). Never Trawl,
 * never a live eBay search.
 */

/** Most titles one search returns. */
export const MAX_SOLD_TITLES = 60;
const MAX_TITLE_LENGTH = 200;

/** Letters, spaces, dots, apostrophes and hyphens; two words or more. "" when it can't be a player name. */
export function soldTitlePlayer(value: string | null | undefined): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (text.length < 3 || text.length > 60) return "";
  if (!/^[\p{L} .'-]+$/u.test(text)) return "";
  const words = text.split(" ").filter((word) => /\p{L}/u.test(word));
  return words.length >= 2 ? text : "";
}

/**
 * An ILIKE pattern with the name's words in order: "%aidan%miller%". Only
 * letters reach it, so % and _ from the input can't widen the search.
 */
export function soldTitlePattern(player: string): string {
  const words = player
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 2);
  return words.length > 0 ? `%${words.join("%")}%` : "";
}

/** The route's body, checked: only string titles, a price and a date pass. */
export function soldTitlesFromBody(body: unknown): SoldTitle[] {
  const list = (body as { titles?: unknown } | null)?.titles;
  if (!Array.isArray(list)) return [];
  const out: SoldTitle[] = [];
  for (const item of list.slice(0, MAX_SOLD_TITLES)) {
    const title = (item as { title?: unknown })?.title;
    if (typeof title !== "string" || !title.trim()) continue;
    const price = (item as { price?: unknown }).price;
    const soldAt = (item as { soldAt?: unknown }).soldAt;
    out.push({
      title: title.slice(0, MAX_TITLE_LENGTH),
      price: typeof price === "number" && Number.isFinite(price) ? price : null,
      soldAt: typeof soldAt === "string" ? soldAt : null,
    });
  }
  return out;
}
