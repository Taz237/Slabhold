import type { CatalogCard } from "@/lib/card-catalog";
import { ownershipMatchKey } from "@/lib/social/card-identity";

/** About eight catalog rows. Add Card still asks the shared ranker for 20. */
export const SEARCH_CATALOG_LIMIT = 8;

const FIELD_LIMIT = 80;

export type CatalogPageLink = {
  href: string;
  label: string;
};

type IdentityFields = {
  playerName: string;
  year?: number | null;
  yearLabel?: string | null;
  setBrand: string;
  cardNumber?: string | null;
  parallel?: string | null;
};

function clip(value: string): string {
  return value.trim().slice(0, FIELD_LIMIT);
}

function identityOf(card: IdentityFields) {
  return ownershipMatchKey({
    playerName: card.playerName,
    year: card.year ?? 0,
    yearLabel: card.yearLabel ?? "",
    setBrand: card.setBrand,
    cardNumber: card.cardNumber ?? "",
    parallel: card.parallel ?? "",
  });
}

/** Year, set, number, and parallel under the player name. */
export function catalogResultLine(card: {
  yearLabel: string;
  setBrand: string;
  cardNumber: string;
  parallel: string;
}): string {
  const number = card.cardNumber.trim();
  return [card.yearLabel.trim(), card.setBrand.trim(), number ? `#${number}` : "", card.parallel.trim() || "Base"]
    .filter(Boolean)
    .join(" ");
}

/** Opens Add card with the same fields a catalog pick fills in. */
export function catalogAddHref(card: CatalogCard): string {
  const params = new URLSearchParams();
  params.set("pick", "1");
  params.set("player", card.playerName);
  params.set("year", card.yearLabel);
  params.set("set", card.setBrand);
  params.set("num", card.cardNumber);
  params.set("parallel", card.parallel || "Base");
  if (card.sport) params.set("sport", card.sport);
  if (card.isRookie) params.set("rookie", "1");
  return `/cards/new?${params.toString()}`;
}

/** The catalog row encoded on an Add card link. Null unless this was a catalog pick. */
export function catalogCardFromParams(params: {
  pick?: string;
  player?: string;
  year?: string;
  set?: string;
  num?: string;
  parallel?: string;
  sport?: string;
  rookie?: string;
}): CatalogCard | null {
  if (params.pick !== "1") return null;
  const playerName = clip(params.player ?? "");
  if (!playerName) return null;
  return {
    id: "search-pick",
    playerName,
    yearLabel: clip(params.year ?? ""),
    setBrand: clip(params.set ?? ""),
    cardNumber: clip(params.num ?? ""),
    parallel: clip(params.parallel ?? "") || "Base",
    sport: clip(params.sport ?? ""),
    isRookie: params.rookie === "1",
  };
}

/**
 * One secondary link when a page for this catalog card is already on screen.
 * The viewer's own card wins (that page shows sold comps). Otherwise a public
 * card page. Cards that are not in either list are not linked.
 */
export function catalogSecondaryLink(
  catalog: CatalogCard,
  input: {
    ownCards: readonly (IdentityFields & { id: string })[];
    publicCards: readonly (IdentityFields & { id: string; ownerId: string })[];
    profiles: readonly { id: string; username: string }[];
    blockedIds?: readonly string[];
  },
): CatalogPageLink | null {
  const key = identityOf(catalog);
  const own = input.ownCards.find((card) => identityOf(card) === key);
  if (own) return { href: `/cards/${encodeURIComponent(own.id)}`, label: "Your card" };

  const blocked = new Set(input.blockedIds ?? []);
  const usernames = new Map(input.profiles.map((profile) => [profile.id, profile.username]));
  const publicCard = input.publicCards.find((card) => {
    if (blocked.has(card.ownerId)) return false;
    if (identityOf(card) !== key) return false;
    const username = usernames.get(card.ownerId)?.trim();
    return Boolean(username);
  });
  if (!publicCard) return null;
  const username = usernames.get(publicCard.ownerId)?.trim();
  if (!username) return null;
  return {
    href: `/u/${encodeURIComponent(username)}/cards/${encodeURIComponent(publicCard.id)}`,
    label: "Public card",
  };
}
