export type RepriceRefreshResult = {
  nSales: number;
  [key: string]: unknown;
};

export type RepriceFromCacheDeps<T extends RepriceRefreshResult = RepriceRefreshResult> = {
  refresh: (
    cardId: string,
    options: {
      cacheOnly: true;
      replaceValue: true;
      beforeTrawl: () => Promise<boolean>;
    },
  ) => Promise<T>;
  revalidate: (cardId: string) => void;
};

/**
 * Recompute from cache, then revalidate before the promise resolves.
 * Callers (flag undo / hidden-sale restore) must await this before returning.
 * Defaults are injected by the route so tests stay free of server-only imports.
 */
export async function repriceCardFromCache<T extends RepriceRefreshResult>(
  cardId: string,
  deps: RepriceFromCacheDeps<T>,
): Promise<T> {
  try {
    return await deps.refresh(cardId, {
      cacheOnly: true,
      replaceValue: true,
      beforeTrawl: async () => false,
    });
  } finally {
    deps.revalidate(cardId);
  }
}
