import type { IdentityCard } from "@/lib/social/card-identity";
import { cardIdentityKey } from "@/lib/social/card-identity";
import { isPublicForSaleListing } from "./listing";
import { wantShortLabel } from "./label";
import type { WantMatchEvent, WantSourceType } from "./notify-want-matches";

/**
 * want_alerts.source_type is sale, post, or listing. A card alert is stored
 * as a post, keyed by the card id, so it does not replace a listing alert.
 */
export function storedWantSourceType(
  sourceType: WantSourceType,
): "sale" | "post" | "listing" {
  return sourceType === "card" ? "post" : sourceType;
}

type OwnedCard = IdentityCard & {
  id: string;
  isPublic?: boolean | null;
  category?: string | null;
  sellPrice?: number | null;
  sellDate?: string | null;
};

/** Follower alert for a card the actor just added. Null when no alert is due. */
export function ownedCardWantEvent(input: {
  actorId: string;
  card: OwnedCard;
  username: string | null;
  band: { median: number; low: number | null } | null;
}): WantMatchEvent | null {
  const { card } = input;
  if (!card.isPublic) return null;
  if (isPublicForSaleListing(card)) return null;
  const username = input.username?.replace(/^@/, "").trim() || null;
  return {
    sourceType: "card",
    sourceId: card.id,
    cardKey: cardIdentityKey(card),
    cardId: card.id,
    actorId: input.actorId,
    actorUsername: username,
    label: wantShortLabel(card),
    href: username ? `/u/${username}/cards/${card.id}` : `/cards/${card.id}`,
    followersOnly: true,
    cardIsPublic: true,
    cardValue: input.band?.median ?? null,
    fairLow: input.band?.low ?? null,
  };
}
