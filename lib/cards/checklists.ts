import { productPhrase, sameSeason } from "@/lib/cards/product-data";

/**
 * The checklist store: who is on each card number of a product. One JSON file per product and
 * year in lib/cards/data/checklists/, written by scripts/import-checklist.ts, and index.json,
 * the log of where each one came from. Pure helpers only: the files load in checklist-load.ts.
 *
 * The scanner uses it as a lookup, never a guess: once the year, set and card # are read off the
 * card, the player is whoever the checklist puts on that number (lib/scan/player-lookup.ts).
 */

/** One card: its number as printed ("103", "BCP-52"), the player, and the team's place in `teams`. */
export type ChecklistRow = readonly [number: string, player: string, team: number];

export type ChecklistSection = {
  /** "Base", "Rookie Autographs": the part of the product these numbers belong to. */
  name: string;
  cards: ChecklistRow[];
};

export type ChecklistProduct = {
  sport: string;
  yearLabel: string;
  product: string;
  /** Where the checklist came from: a URL, or the maker's file name. */
  source: string;
  /** The day it was read, YYYY-MM-DD. */
  read: string;
  /** Team and school names, so each card stores a small number. -1 on a card: no team. */
  teams: string[];
  sections: ChecklistSection[];
};

/** A row of index.json: the log of every checklist in the store. */
export type ChecklistIndexEntry = {
  /** The file name without ".json". */
  file: string;
  sport: string;
  yearLabel: string;
  product: string;
  source: string;
  read: string;
  cards: number;
};

export type ChecklistHit = {
  player: string;
  team: string;
  section: string;
  sport: string;
  yearLabel: string;
  product: string;
};

/** "BCP-52", "bcp 52" and "#BCP52" are one number. */
export function checklistNumberKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** "2023-football-panini-prizm": the file a product and year are stored in. */
export function checklistFileName(product: { sport: string; yearLabel: string; product: string }): string {
  const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [slug(product.yearLabel), slug(product.sport), slug(product.product)].join("-");
}

/** The same product: the same release year and the same set name ("Prizm" is "Panini Prizm"). */
export function sameChecklistProduct(
  entry: { yearLabel: string; product: string },
  card: { yearLabel: string; setBrand: string },
): boolean {
  const phrase = productPhrase(card.setBrand);
  return Boolean(phrase) && sameSeason(entry.yearLabel, card.yearLabel) && productPhrase(entry.product) === phrase;
}

/**
 * Everyone the loaded checklists put on this card number, for this year and set (any sport when
 * the scan has none). A card with two players on it is skipped: it names nobody on its own.
 */
export function playersAt(
  products: readonly ChecklistProduct[],
  card: { yearLabel: string; setBrand: string; cardNumber: string; sport?: string },
): ChecklistHit[] {
  const number = checklistNumberKey(card.cardNumber);
  if (!number) return [];
  const hits: ChecklistHit[] = [];
  for (const product of products) {
    if (!sameChecklistProduct(product, card)) continue;
    if (card.sport && product.sport.toLowerCase() !== card.sport.toLowerCase()) continue;
    for (const section of product.sections) {
      for (const [cardNumber, player, team] of section.cards) {
        if (checklistNumberKey(cardNumber) !== number || !player.trim()) continue;
        hits.push({
          player,
          team: product.teams[team] ?? "",
          section: section.name,
          sport: product.sport,
          yearLabel: product.yearLabel,
          product: product.product,
        });
      }
    }
  }
  return hits;
}
