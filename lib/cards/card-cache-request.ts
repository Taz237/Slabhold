import { isUuid } from "@/lib/value/card-value-access";

export type CardCacheDeps = {
  getUserId: () => Promise<string | null>;
  /**
   * The card's owner, read past RLS so a private card is not mistaken for a
   * deleted one. ownerId is null when the card is gone (just deleted).
   * ok is false when the owner can't be read, and the refresh is refused.
   */
  cardOwner: (cardId: string) => Promise<{ ok: true; ownerId: string | null } | { ok: false }>;
  revalidate: (cardId: string) => void;
};

/**
 * The owner flipped a card's public switch or deleted it. Drop the cached
 * card page lookup so the change shows at once instead of within 5 minutes.
 * The proxy's per-request privacy check is separate and unchanged.
 */
export async function postCardCacheRefresh(request: Request, deps: CardCacheDeps): Promise<Response> {
  const userId = await deps.getUserId();
  if (!userId) {
    return Response.json({ error: "You need to be signed in." }, { status: 401 });
  }

  let body: { cardId?: unknown } | null = null;
  try {
    body = (await request.json()) as { cardId?: unknown } | null;
  } catch {
    body = null;
  }
  const cardId = typeof body?.cardId === "string" ? body.cardId : "";
  if (!isUuid(cardId)) {
    return Response.json({ error: "Missing card." }, { status: 400 });
  }

  const owner = await deps.cardOwner(cardId);
  if (!owner.ok || (owner.ownerId !== null && owner.ownerId !== userId)) {
    return Response.json({ error: "Not your card." }, { status: 403 });
  }

  deps.revalidate(cardId);
  return Response.json({ ok: true });
}
