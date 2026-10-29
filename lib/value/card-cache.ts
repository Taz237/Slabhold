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

/**
 * Narrow tag for whether a card can be shown publicly: the card page's
 * public_cards lookup and its public comps read. Busted when the owner flips
 * the public switch or deletes the card, without touching the comps caches
 * under `card:${id}`.
 */
export function cardVisibilityTag(cardId: string): string {
  return `card-visibility:${cardId}`;
}
