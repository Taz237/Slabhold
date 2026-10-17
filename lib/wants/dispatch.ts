import "server-only";

import type { CleanedSale, SoldCompCard } from "@/lib/comps/types";
import { mapCardRow, type CardRow } from "@/lib/social/cards";
import { cardIdentityKey } from "@/lib/social/card-identity";
import type { PublicCard } from "@/lib/social/types";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isPublicForSaleListing } from "./listing";
import { wantShortLabel } from "./label";
import { notifyWantMatches, type WantMatchEvent } from "./notify-want-matches";
import { createSupabaseWantDb } from "./want-db";

async function usernameOf(userId: string): Promise<string | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  return (data?.username as string | undefined) ?? null;
}

/** New matched sales stored for this card. Does not call Trawl. */
export async function notifyMatchedSales(
  card: SoldCompCard,
  sales: CleanedSale[],
): Promise<number> {
  const db = createSupabaseWantDb();
  if (!db || !card.id || sales.length === 0) return 0;
  const cardKey = cardIdentityKey(card);
  const label = wantShortLabel(card);
  let notified = 0;
  for (const sale of sales) {
    if (!sale.itemId || sale.itemId === "__empty__") continue;
    const event: WantMatchEvent = {
      sourceType: "sale",
      sourceId: sale.itemId,
      cardKey,
      cardId: card.id,
      actorId: null,
      actorUsername: null,
      label,
      href: `/cards/${card.id}`,
      soldAt: sale.soldAt,
      price: sale.price,
    };
    notified += await notifyWantMatches(event, db);
  }
  return notified;
}

/** Returns the number notified, or null when the post isn't this user's. */
export async function notifyOwnedPost(
  actorId: string,
  postId: string,
): Promise<number | null> {
  const admin = createSupabaseAdmin();
  const db = createSupabaseWantDb();
  if (!admin || !db) return 0;
  const { data, error } = await admin
    .from("posts")
    .select("id, user_id, card")
    .eq("id", postId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== actorId) return null;
  const card = data.card as PublicCard | null;
  if (!card?.playerName) return 0;
  const username = await usernameOf(actorId);
  return notifyWantMatches(
    {
      sourceType: "post",
      sourceId: postId,
      cardKey: cardIdentityKey(card),
      cardId: card.id,
      actorId,
      actorUsername: username,
      label: wantShortLabel(card),
      href: `/posts/${postId}`,
    },
    db,
  );
}

/** Returns the number notified, or null when the card isn't this user's. */
export async function notifyOwnedListing(
  actorId: string,
  cardId: string,
): Promise<number | null> {
  const admin = createSupabaseAdmin();
  const db = createSupabaseWantDb();
  if (!admin || !db) return 0;
  const { data, error } = await admin
    .from("cards")
    .select("*")
    .eq("id", cardId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== actorId) return null;
  const card = mapCardRow(data as CardRow);
  if (!isPublicForSaleListing(card)) return 0;
  const username = await usernameOf(actorId);
  const href = username
    ? `/u/${username}/cards/${card.id}`
    : `/cards/${card.id}`;
  return notifyWantMatches(
    {
      sourceType: "listing",
      sourceId: card.id,
      cardKey: cardIdentityKey(card),
      cardId: card.id,
      actorId,
      actorUsername: username,
      label: wantShortLabel(card),
      href,
    },
    db,
  );
}
