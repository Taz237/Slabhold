import type { CatalogCard } from "@/lib/card-catalog";
import { normalizeCardNumberInput } from "@/lib/card-options";
import { expandAliasTokens, normalizeSearchText } from "@/lib/card-search-query";

/** Pause after typing before the one catalog match search. */
export const CATALOG_MATCH_DEBOUNCE_MS = 450;

export const CATALOG_MISSING_NOTE =
  "Not in our catalog yet. We'll still look for sales using what you typed, and add it to the catalog.";

/** The typed fields a catalog match compares. Parallel can differ. */
export type CatalogMatchForm = {
  playerName: string;
  yearLabel: string;
  setBrand: string;
  cardNumber: string;
  noNumber: boolean;
};

/** Maker words shared by many sets. One of these alone is not a set match. */
const MAKER_WORDS = new Set(["panini", "topps", "upper", "deck", "leaf", "bowman"]);

function words(value: string): string[] {
  return normalizeSearchText(value).split(" ").filter(Boolean);
}

function playerMatches(typed: string, catalog: string): boolean {
  const want = normalizeSearchText(catalog);
  const tokens = words(typed);
  if (tokens.join(" ") === want) return true;
  return expandAliasTokens(tokens).join(" ") === want;
}

function numberKey(value: string): string {
  return normalizeSearchText(normalizeCardNumberInput(value));
}

/** Share of set words in common, or null when the sets do not overlap. */
function setScore(typed: string, catalog: string): number | null {
  const a = new Set(words(typed));
  const b = new Set(words(catalog));
  if (a.size === 0 || b.size === 0) return null;
  const shared = [...a].filter((word) => b.has(word));
  const same = shared.length === a.size && shared.length === b.size;
  if (!same && !shared.some((word) => !MAKER_WORDS.has(word))) return null;
  return shared.length / new Set([...a, ...b]).size;
}

/** One card, whatever its parallel. */
function identity(card: CatalogCard): string {
  return [
    normalizeSearchText(card.playerName),
    normalizeSearchText(card.yearLabel),
    normalizeSearchText(card.setBrand),
    numberKey(card.cardNumber),
  ].join("|");
}

/**
 * The catalog row a hand-typed card most likely is, or null.
 * Player (or its alias), year, and card number must match after normalizing,
 * and the set words must overlap. Rows that differ only by parallel count as
 * one card. A tie between two cards returns null so nothing is guessed.
 */
export function bestCatalogMatch(
  form: CatalogMatchForm,
  results: readonly CatalogCard[],
): CatalogCard | null {
  const year = normalizeSearchText(form.yearLabel);
  const number = numberKey(form.cardNumber);
  if (!year || (!form.noNumber && !number)) return null;

  const best = new Map<string, { card: CatalogCard; score: number }>();
  for (const card of results) {
    if (!playerMatches(form.playerName, card.playerName)) continue;
    if (normalizeSearchText(card.yearLabel) !== year) continue;
    if (!form.noNumber && numberKey(card.cardNumber) !== number) continue;
    const score = setScore(form.setBrand, card.setBrand);
    if (score == null) continue;
    const key = identity(card);
    const seen = best.get(key);
    if (!seen || (seen.card.parallel !== "Base" && card.parallel === "Base")) {
      best.set(key, { card, score });
    }
  }

  let top: { card: CatalogCard; score: number } | null = null;
  let tied = false;
  for (const entry of best.values()) {
    if (!top || entry.score > top.score) {
      top = entry;
      tied = false;
    } else if (entry.score === top.score) {
      tied = true;
    }
  }
  return top && !tied ? top.card : null;
}

/** Search text for the match lookup, or null until the card is filled in enough to match. */
export function catalogMatchQuery(form: CatalogMatchForm): string | null {
  const player = normalizeSearchText(form.playerName);
  const year = normalizeSearchText(form.yearLabel);
  const set = normalizeSearchText(form.setBrand);
  const number = numberKey(form.cardNumber);
  if (!player || !year || !set) return null;
  if (!form.noNumber && !number) return null;
  return [player, year, form.noNumber ? "" : number].filter(Boolean).join(" ");
}

/** Identifies one lookup. The set is part of it because the match compares set words. */
export function catalogMatchKey(form: CatalogMatchForm): string | null {
  const query = catalogMatchQuery(form);
  return query ? `${query}|${normalizeSearchText(form.setBrand)}` : null;
}

export type CatalogMatchLookup = { query: string; match: CatalogCard | null };

/**
 * What to show under the typed card. "chip" asks "Is this your card?",
 * "missing" is the not-in-catalog note, null shows nothing (searching,
 * dismissed, picked from search, or not filled in yet).
 */
export function catalogMatchView(input: {
  query: string | null;
  dismissed: boolean;
  lookup: CatalogMatchLookup | null;
}): "chip" | "missing" | null {
  if (!input.query || input.dismissed) return null;
  if (!input.lookup || input.lookup.query !== input.query) return null;
  return input.lookup.match ? "chip" : "missing";
}

/** "Use this" keeps the parallel the user chose. */
export function matchForApply(match: CatalogCard, parallel: string): CatalogCard {
  return { ...match, parallel: parallel.trim() || match.parallel };
}
