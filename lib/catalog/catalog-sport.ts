/** Stored sport values. Pokémon stays valid so an existing card still saves and displays. */
export const MAIL_DAY_SPORTS = [
  "Baseball",
  "Basketball",
  "Football",
  "Hockey",
  "Soccer",
  "Pokémon",
  "Other",
] as const;

export type MailDaySport = (typeof MAIL_DAY_SPORTS)[number];

export function isMailDaySport(value: string): value is MailDaySport {
  return (MAIL_DAY_SPORTS as readonly string[]).includes(value);
}

/** Keep a sport the user already picked. Offer the catalog sport when it differs. */
export function sportAfterCatalogPick(
  current: string,
  catalogSport: string,
): { sport: string; offer: string } {
  const chosen = current.trim();
  const listed = isMailDaySport(catalogSport) ? catalogSport : "";
  return {
    sport: chosen || listed,
    offer: chosen && listed && chosen !== listed ? listed : "",
  };
}

/** Rated Rookie and RC on a search result or title mean the card is a rookie. */
export function textLooksRookie(text: string): boolean {
  return /\brated\s+rookies?\b/i.test(text) || /\brc\b/i.test(text);
}

/** Check Rookie when the catalog row is a rookie, or the title already says so. */
export function rookieAfterCatalogPick(
  current: boolean,
  card: {
    isRookie?: boolean;
    playerName: string;
    setBrand: string;
    parallel?: string | null;
    cardNumber: string;
  },
): boolean {
  const title = [card.playerName, card.setBrand, card.parallel, card.cardNumber].join(" ");
  return current || card.isRookie === true || textLooksRookie(title);
}
