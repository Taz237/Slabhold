/** Old key shared by every account on the device. Removed once, never copied. */
export const SHARED_RECENT_SEARCH_KEY = "slabhold.search.recent.v1";

export const RECENT_SEARCH_LIMIT = 8;

export const ADD_CARD_QUERY_LIMIT = 100;

export type RecentStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/** Signed-out searches stay on `.guest`, never on another account's key. */
export function recentSearchKey(userId: string | null | undefined): string {
  const id = userId?.trim() ?? "";
  return `${SHARED_RECENT_SEARCH_KEY}.${id || "guest"}`;
}

export function parseRecentSearches(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string").slice(0, RECENT_SEARCH_LIMIT);
  } catch {
    return [];
  }
}

export function rememberRecentSearch(items: readonly string[], term: string): string[] {
  const next = term.trim();
  if (!next) return items as string[];
  return [next, ...items.filter((item) => item.toLowerCase() !== next.toLowerCase())].slice(
    0,
    RECENT_SEARCH_LIMIT,
  );
}

/** One browser session. The shared key is deleted on the first successful try, and not again. */
export function createRecentSearchStore() {
  let dropped = false;
  return {
    dropShared(store: Pick<RecentStore, "removeItem">) {
      if (dropped) return;
      try {
        store.removeItem(SHARED_RECENT_SEARCH_KEY);
      } catch {
        return;
      }
      dropped = true;
    },
    read(store: RecentStore, userId: string | null | undefined) {
      try {
        this.dropShared(store);
        return parseRecentSearches(store.getItem(recentSearchKey(userId)));
      } catch {
        return [];
      }
    },
    save(store: RecentStore, userId: string | null | undefined, items: readonly string[]) {
      try {
        const key = recentSearchKey(userId);
        const next = items.slice(0, RECENT_SEARCH_LIMIT);
        if (next.length === 0) store.removeItem(key);
        else store.setItem(key, JSON.stringify(next));
      } catch {
        // Leave storage unchanged when the browser blocks it.
      }
    },
  };
}

function browserStore(): RecentStore {
  return window.localStorage;
}

/** Recents for this account, or [] when site storage throws. */
export function readBrowserRecentSearches(userId: string | null | undefined): string[] {
  try {
    return parseRecentSearches(browserStore().getItem(recentSearchKey(userId)));
  } catch {
    return [];
  }
}

/** Writes this account's list. A blocked store is ignored. */
export function saveBrowserRecentSearches(
  accounts: { save(store: RecentStore, userId: string | null | undefined, items: readonly string[]): void },
  userId: string | null | undefined,
  items: readonly string[],
) {
  try {
    accounts.save(browserStore(), userId, items);
  } catch {
    // Search still works with no recent list.
  }
}

/** Removes the old shared key. A blocked store is ignored. */
export function dropSharedBrowserRecentSearches(accounts: {
  dropShared(store: Pick<RecentStore, "removeItem">): void;
}) {
  try {
    accounts.dropShared(browserStore());
  } catch {
    // Search still works with no recent list.
  }
}

/** The Add card page keeps at most this many characters of the search text. */
export function addCardQuery(value: string): string {
  return value.slice(0, ADD_CARD_QUERY_LIMIT);
}
