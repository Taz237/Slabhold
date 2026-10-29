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
 * overlap there is a gap, so the fresh page replaces the list. Items inside
 * the fresh page's range that are gone from it (deleted, hidden) drop out.
 * Fresh copies of posts and profiles win, so counts are current.
 */
export function mergeFreshPage<Item extends Keyed, Row extends WithId, Person extends WithId, Cursor>(
  current: RefreshablePage<Item, Row, Person, Cursor>,
  fresh: RefreshablePage<Item, Row, Person, Cursor>,
): { page: RefreshablePage<Item, Row, Person, Cursor>; kept: boolean } {
  const freshKeys = new Set(fresh.items.map((item) => item.key));
  let lastOverlap = -1;
  current.items.forEach((item, index) => {
    if (freshKeys.has(item.key)) lastOverlap = index;
  });
  if (current.items.length === 0 || lastOverlap === -1 || fresh.items.length === 0) {
    return { page: fresh, kept: false };
  }
  const older = current.items.slice(lastOverlap + 1).filter((item) => !freshKeys.has(item.key));
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

/** A timeline left and reopened within this window shows instantly from memory. */
export const TIMELINE_MEMORY_MS = 5 * 60 * 1000;

export function memoryFresh(savedAt: number, now: number): boolean {
  return now - savedAt >= 0 && now - savedAt < TIMELINE_MEMORY_MS;
}
