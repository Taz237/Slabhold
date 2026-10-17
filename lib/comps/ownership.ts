/** True when the signed-in user id is the card's user_id. */
export function isCardOwner(
  cardUserId: string | null | undefined,
  sessionUserId: string | null | undefined,
): boolean {
  return Boolean(cardUserId && sessionUserId && cardUserId === sessionUserId);
}
