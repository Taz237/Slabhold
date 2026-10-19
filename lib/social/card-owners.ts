import { ownershipMatchKey, type IdentityCard } from "./card-identity";
import type { Profile } from "./types";

export const OWNERS_PAGE_SIZE = 12;

export type CardOwnerRow = {
  cardId: string;
  ownerId: string;
  username: string;
  displayName: string;
  avatarDataUrl: string | null;
  accent: string;
  grade: string;
};

type OwnerCandidate = IdentityCard & {
  id: string;
  ownerId: string;
  /** Only public cards may appear. Private rows must be filtered out before calling. */
  isPublic?: boolean;
  grade?: string | null;
};

/**
 * Collectors who publicly own the same card (player + set + number + parallel).
 * Private cards and private collections never enter this list — pass only
 * public_cards rows. Want lists are never consulted.
 * Dedupes by owner (one row per collector). Caps at OWNERS_PAGE_SIZE unless
 * `limit` is raised (e.g. See all).
 */
export function publicOwnersForCard(
  subject: IdentityCard & { id?: string },
  publicCards: readonly OwnerCandidate[],
  profilesById: ReadonlyMap<string, Profile>,
  options?: {
    /** Exclude this card id (the page being viewed). */
    excludeCardId?: string | null;
    /** Max rows to return. Default OWNERS_PAGE_SIZE. */
    limit?: number;
  },
): { owners: CardOwnerRow[]; total: number } {
  const key = ownershipMatchKey(subject);
  if (!key.replace(/\|/g, "").trim()) {
    return { owners: [], total: 0 };
  }

  const excludeId = options?.excludeCardId ?? subject.id ?? null;
  const matched: CardOwnerRow[] = [];
  const seenOwners = new Set<string>();

  for (const card of publicCards) {
    if (card.isPublic === false) continue;
    if (excludeId && card.id === excludeId) continue;
    if (!card.ownerId || seenOwners.has(card.ownerId)) continue;
    if (ownershipMatchKey(card) !== key) continue;

    const profile = profilesById.get(card.ownerId);
    if (!profile?.username) continue;

    seenOwners.add(card.ownerId);
    matched.push({
      cardId: card.id,
      ownerId: card.ownerId,
      username: profile.username,
      displayName: profile.displayName || profile.username,
      avatarDataUrl: profile.avatarDataUrl,
      accent: profile.accent || "#7c5cff",
      grade: (card.grade ?? "").trim() || "Raw",
    });
  }

  const limit = options?.limit ?? OWNERS_PAGE_SIZE;
  return {
    owners: matched.slice(0, Math.max(0, limit)),
    total: matched.length,
  };
}

/** True when a candidate must be kept out of the Owned-by list. */
export function isExcludedFromPublicOwners(card: {
  isPublic?: boolean | null;
  fromWantList?: boolean | null;
}): boolean {
  if (card.fromWantList) return true;
  return card.isPublic === false;
}
