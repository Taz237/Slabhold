import type { TrawlSoldResult } from "@/lib/comps/types";
import type { LiveSearchResult } from "@/lib/scan/live-solds";
import type { PlayerFeedBody, PlayerSale, PlayerSuggestion } from "./player-feed";
import { nameKey } from "./player-names";
import { quickCompLimitMessage } from "./respond";

/** A name as typed: letters, spaces, dots, apostrophes and hyphens, 2 to 60 characters. */
const NAME_TEXT = /^[\p{L}][\p{L} .'’-]{1,59}$/u;

export function readPlayerQuery(params: URLSearchParams): string | null {
  const text = (params.get("q") ?? "").replace(/\s+/g, " ").trim();
  return NAME_TEXT.test(text) ? text : null;
}

/** What we send to the sold search: the name without its suffix or dots, so "Acuff Jr" and "Acuff" titles both come back. */
export function playerSearchQuery(player: string): string {
  return player
    .replace(/[.,]/g, " ")
    .replace(/\s+(?:jr|sr|ii|iii|iv)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type PlayerFeedDeps = {
  enabled: () => boolean;
  userId: () => Promise<string | null>;
  /** The canonical spelling of a known name, or null. */
  canonical: (text: string) => string | null;
  /** Our existing sold search: Quick Comp's caps, spent only on a miss, shared 6 hours per query. */
  liveSearch: (query: string, userId: string) => Promise<LiveSearchResult>;
  toSales: (results: readonly TrawlSoldResult[], player: string) => PlayerSale[];
};

const NO_STORE = { "Cache-Control": "private, no-store" };

/** GET /api/quick-comp/player?q=. One sold search per player; the next look within 6 hours spends nothing. */
export async function respondPlayerFeed(request: Request, deps: PlayerFeedDeps): Promise<Response> {
  if (!deps.enabled()) return Response.json({ error: "Not found" }, { status: 404 });
  const userId = await deps.userId();
  if (!userId) return Response.json({ error: "Log in to see sold prices" }, { status: 401, headers: NO_STORE });
  const text = readPlayerQuery(new URL(request.url).searchParams);
  if (!text) return Response.json({ error: "Type a player name" }, { status: 400, headers: NO_STORE });
  const player = deps.canonical(text) ?? text;
  const result = await deps.liveSearch(playerSearchQuery(player), userId);
  if (!result.ok) {
    if (result.reason === "unavailable") return Response.json({ error: "We couldn't load recent sold prices" }, { status: 503, headers: NO_STORE });
    return Response.json({ error: quickCompLimitMessage(result.reason), reason: result.reason, resetAt: result.resetAt }, { status: 429, headers: NO_STORE });
  }
  const body: PlayerFeedBody = { player, sales: deps.toSales(result.results, player), fetchedAt: result.fetchedAt };
  return Response.json(body, { headers: NO_STORE });
}

export type PlayerSuggestDeps = {
  enabled: () => boolean;
  userId: () => Promise<string | null>;
  names: (text: string) => string[];
  /** Saved sold titles naming this player. Reads only: never a live search. */
  titles: (player: string) => Promise<string[]>;
  phrases: (player: string, titles: readonly string[]) => PlayerSuggestion[];
};

/** Phrases need a few letters, so one-letter typing never reads saved titles. */
export const PHRASE_MIN_CHARS = 3;

/** GET /api/quick-comp/suggest?q=. Names from our checklists and directories, then phrases from saved sold titles. */
export async function respondPlayerSuggest(request: Request, deps: PlayerSuggestDeps): Promise<Response> {
  if (!deps.enabled()) return Response.json({ error: "Not found" }, { status: 404 });
  const userId = await deps.userId();
  if (!userId) return Response.json({ error: "Log in to search" }, { status: 401, headers: NO_STORE });
  const text = readPlayerQuery(new URL(request.url).searchParams);
  if (!text) return Response.json({ suggestions: [] }, { headers: NO_STORE });
  const names = deps.names(text);
  let phrases: PlayerSuggestion[] = [];
  if (names[0] && nameKey(text).replace(/\s/g, "").length >= PHRASE_MIN_CHARS) {
    try {
      phrases = deps.phrases(names[0], await deps.titles(names[0]));
    } catch {
      // Names still show when saved titles can't be read.
      phrases = [];
    }
  }
  const [top, ...rest] = names;
  const suggestions: PlayerSuggestion[] = top ? [{ label: top, player: top }, ...phrases, ...rest.map((name) => ({ label: name, player: name }))] : [];
  return Response.json({ suggestions }, { headers: { "Cache-Control": "private, max-age=60" } });
}
