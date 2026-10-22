import "server-only";

import type { CleanedSale, SoldCompCard } from "@/lib/comps/types";
import { mapCardRow, type CardRow } from "@/lib/social/cards";
import { cardIdentityKey, type IdentityCard } from "@/lib/social/card-identity";
import type { PublicCard } from "@/lib/social/types";
import { escapeIlike } from "@/lib/db/escape-ilike";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { identityBandValue } from "./identity-band";
import { isPublicForSaleListing } from "./listing";
import { wantShortLabel } from "./label";
import { notifyWantMatches, type WantMatchEvent } from "./notify-want-matches";
import { ownedCardWantEvent } from "./owned-card";
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
  fairLow: number | null = null,
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
      saleUrl: sale.url || null,
      fairLow,
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

const IDENTITY_COLUMNS =
  "id, player, year, year_label, set, card_number, parallel, grade, grader, condition_type";

type ValueRow = {
  card_id: string;
  median: number | string | null;
  low: number | string | null;
  n_sales: number | string | null;
  matched_at: string | null;
};

function rowIdentity(row: {
  player: string | null;
  year: number | null;
  year_label: string | null;
  set: string | null;
  card_number: string | null;
  parallel: string | null;
  grade: string | null;
  grader: string | null;
  condition_type: string | null;
}): IdentityCard {
  return {
    playerName: row.player,
    year: row.year,
    yearLabel: row.year_label,
    setBrand: row.set,
    cardNumber: row.card_number,
    parallel: row.parallel,
    grade: row.grade,
    grader: row.grader,
    conditionType: row.condition_type ?? undefined,
  };
}

/**
 * Stored median and fair-price low for this identity. No Trawl call.
 * Public copies only, plus the poster's own card. Never another user's private card.
 */
async function identityBand(
  card: IdentityCard & { id: string },
  posterId: string,
): Promise<{ median: number; low: number | null } | null> {
  const admin = createSupabaseAdmin();
  const player = (card.playerName ?? "").trim();
  if (!admin || !player || !posterId) return null;
  const { data: publicRows, error } = await admin
    .from("public_cards")
    .select(IDENTITY_COLUMNS)
    .ilike("player", escapeIlike(player))
    .limit(40);
  if (error) return null;
  const { data: ownRow, error: ownError } = await admin
    .from("cards")
    .select(IDENTITY_COLUMNS)
    .eq("id", card.id)
    .eq("user_id", posterId)
    .maybeSingle();

  const key = cardIdentityKey(card);
  const publicIds = new Set<string>();
  for (const row of publicRows ?? []) {
    if (cardIdentityKey(rowIdentity(row)) === key) publicIds.add(row.id as string);
  }
  const ids = [...publicIds];
  if (
    !ownError &&
    ownRow &&
    cardIdentityKey(rowIdentity(ownRow)) === key &&
    !publicIds.has(card.id)
  ) {
    ids.push(card.id);
  }
  if (!ids.length) return null;

  const { data: values, error: valueError } = await admin
    .from("card_values")
    .select("card_id, median, low, n_sales, matched_at")
    .in("card_id", ids);
  if (valueError) return null;
  return identityBandValue(
    ((values ?? []) as ValueRow[]).map((value) => ({
      cardId: value.card_id,
      inPublicCards: publicIds.has(value.card_id),
      median: value.median == null ? null : Number(value.median),
      low: value.low == null ? null : Number(value.low),
      nSales: value.n_sales == null ? null : Number(value.n_sales),
      matchedAt: value.matched_at,
    })),
    card.id,
  );
}

/** Followers who want this card. Private cards carry no value and no flag. */
export async function notifyMailDayPost(input: {
  actorId: string;
  postId: string;
  card: IdentityCard & { id: string; isPublic: boolean };
}): Promise<number> {
  const db = createSupabaseWantDb();
  if (!db) return 0;
  const username = await usernameOf(input.actorId);
  let cardValue: number | null = null;
  let fairLow: number | null = null;
  if (input.card.isPublic) {
    const band = await identityBand(input.card, input.actorId);
    cardValue = band?.median ?? null;
    fairLow = band?.low ?? null;
  }
  return notifyWantMatches(
    {
      sourceType: "post",
      sourceId: input.postId,
      cardKey: cardIdentityKey(input.card),
      cardId: input.card.id,
      actorId: input.actorId,
      actorUsername: username,
      label: wantShortLabel(input.card),
      href: `/posts/${input.postId}`,
      mailDay: true,
      followersOnly: true,
      cardIsPublic: input.card.isPublic,
      cardValue,
      fairLow,
    },
    db,
  );
}

/** Followers who want this card. Null when the card is not the actor's. */
export async function notifyOwnedCard(
  actorId: string,
  cardId: string,
): Promise<number | null> {
  const admin = createSupabaseAdmin();
  const db = createSupabaseWantDb();
  if (!admin || !db) return 0;
  const { data, error } = await admin.from("cards").select("*").eq("id", cardId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== actorId) return null;
  const card = mapCardRow(data as CardRow);
  const band =
    card.isPublic && !isPublicForSaleListing(card) ? await identityBand(card, actorId) : null;
  const event = ownedCardWantEvent({
    actorId,
    card,
    username: await usernameOf(actorId),
    band,
  });
  if (!event) return 0;
  return notifyWantMatches(event, db);
}
