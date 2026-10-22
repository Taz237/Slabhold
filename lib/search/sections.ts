export type SearchSectionTitle = "Cards" | "My cards" | "People" | "Posts";

/** Idle search copy. The box finds cards, not only people and posts. */
export const SEARCH_IDLE_DETAIL = "Find people, posts, and cards.";

export const SEARCH_ADD_CARD_LABEL = "Not seeing your card? Add it";

export const SUGGESTED_PLAYER_LIMIT = 6;

/** Add Card with the typed search prefilled when there is something to parse. */
export function addCardSearchHref(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return "/cards/new";
  return `/cards/new?q=${encodeURIComponent(trimmed)}`;
}

/** Newest cards first. Blank names are left for the suggestion list to drop. */
export function recentPlayerNames(
  cards: readonly { playerName: string; createdAt: string }[],
): string[] {
  return [...cards]
    .sort((a, b) => {
      if (a.createdAt === b.createdAt) return 0;
      return a.createdAt < b.createdAt ? 1 : -1;
    })
    .map((card) => card.playerName);
}

/** Players that show up most often, keeping the first spelling. */
export function popularCatalogPlayers(names: readonly string[], limit: number): string[] {
  const counts = new Map<string, { name: string; count: number; first: number }>();
  names.forEach((name, index) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { name: trimmed, count: 1, first: index });
  });
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, Math.max(0, limit))
    .map((row) => row.name);
}

/**
 * A few names for an empty search box.
 * Recent collection players come first, then popular catalog players.
 * Both lists are data the app already has — this does not query Supabase.
 */
export function suggestedSearchPlayers(input: {
  recentPlayers: readonly string[];
  catalogPlayers: readonly string[];
  limit?: number;
}): string[] {
  const limit = input.limit ?? SUGGESTED_PLAYER_LIMIT;
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (name: string) => {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key) || out.length >= limit) return;
    seen.add(key);
    out.push(trimmed);
  };
  for (const name of input.recentPlayers) push(name);
  for (const name of popularCatalogPlayers(input.catalogPlayers, limit)) push(name);
  return out;
}

export function visibleSearchSections(counts: {
  people: number;
  posts: number;
  catalog: number;
  myCards: number;
}): SearchSectionTitle[] {
  const sections: SearchSectionTitle[] = [];
  if (counts.catalog > 0) sections.push("Cards");
  if (counts.myCards > 0) sections.push("My cards");
  if (counts.people > 0) sections.push("People");
  if (counts.posts > 0) sections.push("Posts");
  return sections;
}

/** The add-card miss link is only for a query that matched nothing, including catalog. */
export function showSearchMissLink(input: {
  query: string;
  catalogLoading: boolean;
  people: number;
  posts: number;
  catalog: number;
  myCards: number;
}): boolean {
  const query = input.query.trim();
  if (!query || input.catalogLoading || query.startsWith("@")) return false;
  return (
    visibleSearchSections({
      people: input.people,
      posts: input.posts,
      catalog: input.catalog,
      myCards: input.myCards,
    }).length === 0
  );
}

/** One empty line when a query matches nothing. */
export function searchEmptyTitle(query: string): string {
  return `No results for "${query.trim()}"`;
}
