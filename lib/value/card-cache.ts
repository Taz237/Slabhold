/** Next cache tag for one card's shared comps and value. Not user-specific. */
export function cardCacheTag(cardId: string): string {
  return `card:${cardId}`;
}

/**
 * Drop the shared card cache. `revalidate` is injected so tests can spy
 * without loading Next.
 */
export function revalidateCardCache(
  cardId: string,
  revalidate: (tag: string, profile: string | { expire?: number }) => void,
): void {
  if (!cardId) return;
  revalidate(cardCacheTag(cardId), { expire: 0 });
}
