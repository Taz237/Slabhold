import { normalizeSearchText, parseCardQuery, tokensToMatch } from "@/lib/card-search-query";

/**
 * Words that must match, after case, spacing, @, filler, grade, and rookie words
 * are folded the same way as catalog search.
 * "rookie", "rc", and "rookie card" are not words here. Catalog ranking treats
 * them as the rookie flag. Everywhere else they are filler.
 */
export function meaningfulSearchWords(query: string): string[] {
  const stripped = query.trim().replace(/^@+/, "");
  return tokensToMatch(parseCardQuery(stripped));
}

/** True when every meaningful word appears in at least one field. */
export function matchesEverySearchWord(
  query: string,
  fields: readonly (string | number | null | undefined)[],
): boolean {
  const words = meaningfulSearchWords(query);
  if (words.length === 0) return false;
  const haystack = normalizeSearchText(
    fields.map((field) => (field == null ? "" : String(field))).join(" "),
  );
  return words.every((word) => haystack.includes(word));
}

/** Own-card fields Search is allowed to read. No price, notes, or cert. */
export function ownCardSearchFields(card: {
  playerName: string;
  year: number | string;
  yearLabel?: string | null;
  setBrand: string;
  cardNumber?: string | null;
  parallel?: string | null;
  team?: string | null;
  grade?: string | null;
}): string[] {
  return [
    card.playerName,
    card.yearLabel ?? "",
    String(card.year),
    card.setBrand,
    card.cardNumber ?? "",
    card.parallel ?? "",
    card.team ?? "",
    card.grade ?? "",
  ];
}
