/**
 * Pull to refresh on a paged timeline. The newest page is fetched again and
 * laid over what is already on screen, so the list never empties and the
 * pages you already scrolled through stay loaded.
 */

type Keyed = { key: string };
type WithId = { id: string };

export type RefreshablePage<Item extends Keyed, Row extends WithId, Person extends WithId, Cursor> = {
  items: Item[];
  posts: Row[];
  relatedPosts: Row[];
  profiles: Person[];
  hasMore: boolean;
  nextCursor: Cursor | null;
};

function unionById<T extends WithId>(first: readonly T[], second: readonly T[]): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const row of [...first, ...second]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}

/**
 * Fresh page first, then the older loaded items below the overlap. With no
 * overlap there is a gap, so the fresh page replaces the list and its cursor
 * takes over. Items inside the fresh page's range that are gone from it
 * (deleted, hidden) drop out. `idOf` names the post behind an item, so a post
 * already in the fresh page doesn't show again lower down as a repost.
 * Fresh copies of posts and profiles win, so counts are current.
 */
export function mergeFreshPage<Item extends Keyed, Row extends WithId, Person extends WithId, Cursor>(
  current: RefreshablePage<Item, Row, Person, Cursor>,
  fresh: RefreshablePage<Item, Row, Person, Cursor>,
  idOf: (item: Item) => string = (item) => item.key,
): { page: RefreshablePage<Item, Row, Person, Cursor>; kept: boolean } {
  const freshKeys = new Set(fresh.items.map((item) => item.key));
  const freshIds = new Set(fresh.items.map(idOf));
  let lastOverlap = -1;
  current.items.forEach((item, index) => {
    if (freshKeys.has(item.key)) lastOverlap = index;
  });
  if (current.items.length === 0 || lastOverlap === -1 || fresh.items.length === 0) {
    return { page: fresh, kept: false };
  }
  const older: Item[] = [];
  for (const item of current.items.slice(lastOverlap + 1)) {
    const id = idOf(item);
    if (freshKeys.has(item.key) || freshIds.has(id)) continue;
    freshIds.add(id);
    older.push(item);
  }
  if (older.length === 0) return { page: fresh, kept: false };
  return {
    page: {
      items: [...fresh.items, ...older],
      posts: unionById(fresh.posts, current.posts),
      relatedPosts: unionById(fresh.relatedPosts, current.relatedPosts),
      profiles: unionById(fresh.profiles, current.profiles),
      hasMore: current.hasMore,
      nextCursor: current.nextCursor,
    },
    kept: true,
  };
}

/** Pull to refresh reads at most this many pages looking for the loaded head. */
export const REFRESH_MAX_PAGES = 3;

/**
 * Reads the newest pages until one reaches an item already on screen, so a
 * refresh after more than a page of new posts leaves no hole between the new
 * head and the older pages. Stops at REFRESH_MAX_PAGES; mergeFreshPage then
 * finds no overlap and drops the stale pages instead. Items repeated across
 * the pages it reads show once.
 */
export async function fetchFreshHead<Item extends Keyed, Row extends WithId, Person extends WithId, Cursor>(input: {
  current: RefreshablePage<Item, Row, Person, Cursor>;
  fetchPage: (
    cursor: Cursor | null,
    seenIds: ReadonlySet<string>,
  ) => Promise<RefreshablePage<Item, Row, Person, Cursor>>;
  idOf?: (item: Item) => string;
  maxPages?: number;
}): Promise<RefreshablePage<Item, Row, Person, Cursor>> {
  const idOf = input.idOf ?? ((item: Item) => item.key);
  const loadedKeys = new Set(input.current.items.map((item) => item.key));
  const maxPages = input.maxPages ?? REFRESH_MAX_PAGES;
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  let fresh: RefreshablePage<Item, Row, Person, Cursor> | null = null;
  let cursor: Cursor | null = null;
  for (let read = 0; read < maxPages; read++) {
    const next = await input.fetchPage(cursor, seenIds);
    const items: Item[] = fresh ? [...fresh.items] : [];
    for (const item of next.items) {
      const id = idOf(item);
      if (seenKeys.has(item.key) || seenIds.has(id)) continue;
      seenKeys.add(item.key);
      seenIds.add(id);
      items.push(item);
    }
    fresh = {
      items,
      posts: fresh ? unionById(next.posts, fresh.posts) : next.posts,
      relatedPosts: fresh ? unionById(next.relatedPosts, fresh.relatedPosts) : next.relatedPosts,
      profiles: fresh ? unionById(next.profiles, fresh.profiles) : next.profiles,
      hasMore: next.hasMore,
      nextCursor: next.nextCursor,
    };
    const reached = loadedKeys.size === 0 || next.items.some((item) => loadedKeys.has(item.key));
    if (reached || !next.hasMore || next.nextCursor === null) break;
    cursor = next.nextCursor;
  }
  return fresh!;
}

/**
 * True when the newest read (`freshKeys`, newest first) starts with items
 * above the head already loaded. Read only, so nothing on screen moves.
 */
export function hasNewerItems(loadedKeys: readonly string[], freshKeys: readonly string[]): boolean {
  if (loadedKeys.length === 0 || freshKeys.length === 0) return false;
  const loaded = new Set(loadedKeys);
  return !loaded.has(freshKeys[0]);
}

/** A timeline left and reopened within this window shows instantly from memory. */
export const TIMELINE_MEMORY_MS = 5 * 60 * 1000;

export function memoryFresh(savedAt: number, now: number): boolean {
  return now - savedAt >= 0 && now - savedAt < TIMELINE_MEMORY_MS;
}
