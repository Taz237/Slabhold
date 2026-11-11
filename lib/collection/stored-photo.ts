/**
 * After a save uploads a card's local photo, the card in memory takes the
 * stored URL. A post made from it then attaches that URL instead of uploading
 * the same photo again, and the base64 copy leaves memory.
 * Only when the card still holds the photo that was saved.
 */
export function adoptStoredPhoto<T extends { id: string; photoDataUrl: string | null }>(
  cards: T[],
  id: string,
  savedPhoto: string | null,
  storedUrl: string | null,
): T[] {
  if (!storedUrl || !savedPhoto?.startsWith("data:")) return cards;
  const index = cards.findIndex((card) => card.id === id && card.photoDataUrl === savedPhoto);
  if (index < 0) return cards;
  const next = cards.slice();
  next[index] = { ...cards[index], photoDataUrl: storedUrl };
  return next;
}
