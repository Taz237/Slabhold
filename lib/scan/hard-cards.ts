import { sameParallelLoosely } from "@/lib/cards/parallels";
import { productPhrase } from "@/lib/cards/product-data";
import { nameKey } from "./player-lookup";

/**
 * The hard-cards set (hard-cards-v1.json): real cards the scanner tends to miss, each checked
 * against a checklist and real sold titles. Text cases, not photos: the front is how the printed
 * front reads, and the back is built here from the card #, the year and the product.
 *
 * To add a card, append it to the JSON's "cards" (hc-074, hc-075, …). Nothing here names a card,
 * a product or a parallel: hard-cards.test.ts scores whatever the file holds.
 *
 * Optional on a card: "parallel_also", other names for the same parallel that count as right
 * (the checklist's name beside the sellers' name), and "player_also", the same person as our
 * player list spells them.
 */

export type HardCard = {
  id: string;
  category: string;
  year: string;
  manufacturer: string;
  product: string;
  card_number: string;
  player: string;
  /** The same person as our player list spells them, when it differs by more than accents or case ("Tre Johnson" for Tre Johnson III). */
  player_also?: string[];
  team: string;
  /** null: a base card. */
  parallel: string | null;
  parallel_also?: string[];
  /** null: not numbered. */
  print_run: number | null;
  sport: string;
  is_rookie: boolean;
  typical_ocr_front: string[];
  why_hard: string;
  source_urls: string[];
  /** Real seller titles for the card: the mocked sold listings, never fetched. */
  listing_title_examples: string[];
  confidence: string;
};

export type Mark = "right" | "open" | "wrong";
export const HARD_FIELDS = ["player", "year", "set", "number", "parallel", "run"] as const;
export type HardField = (typeof HARD_FIELDS)[number];

const SPORT_WORD = /\s+(?:baseball|basketball|football|hockey|soccer)$/i;

/** "Bowman Baseball (paper Prospects, BP-)" and "… - Sapphire Selections" are the product "Bowman Baseball". */
function productLine(product: string): string {
  return product.replace(/\([^)]*\)/g, " ").replace(/\s+-\s+.*$/, "").replace(/\s+/g, " ").trim();
}

/**
 * The set the way Add card spells it, from the product's full name: no sport word, "University"
 * is "U", "Sapphire Edition" is "Sapphire", "Update Series" is "Update", and "Series 1" of a
 * product is the product ("Upper Deck Series 2" is "Upper Deck").
 */
export function hardCardSet(product: string): string {
  return productLine(product)
    .replace(SPORT_WORD, "")
    .replace(/\bUniversity\b/i, "U")
    .replace(/\bSapphire Edition\b/i, "Sapphire")
    .replace(/\bUpdate Series\b/i, "Update")
    .replace(/\s+Series\s+\d\b/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A short back: the card # and the product line, as a back prints them. A plain number reads "No. 103"; a code reads as it is. */
export function hardCardBack(card: HardCard): string[] {
  const number = /^\d+$/.test(card.card_number) ? `No. ${card.card_number}` : card.card_number;
  return [number, `${card.year} ${productLine(card.product)}`.toUpperCase()];
}

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const wordKey = (text: string) => words(text).sort().join(" ");
const SUFFIX = /\s+(jr|sr|ii|iii|iv|v)\.?$/i;

/**
 * The same player: accents, case, periods and apostrophes aside. A suffix the card prints must be
 * there ("Marvin Harrison" is not Marvin Harrison Jr.); our list adding one the truth leaves off
 * ("Labaron Philon Jr.") is the same person.
 */
export function markPlayer(got: string, truth: string, also: readonly string[] = []): Mark {
  if (!got.trim()) return "open";
  if (also.some((name) => name.trim().toLowerCase() === got.trim().toLowerCase())) return "right";
  if (nameKey(got) !== nameKey(truth)) return "wrong";
  const wanted = SUFFIX.exec(truth.trim())?.[1].toLowerCase();
  const shown = SUFFIX.exec(got.trim())?.[1].toLowerCase();
  return wanted && wanted !== shown ? "wrong" : "right";
}

export function markSet(got: string, card: HardCard): Mark {
  if (!got.trim()) return "open";
  return productPhrase(hardCardSet(got)) === productPhrase(hardCardSet(card.product)) ? "right" : "wrong";
}

export function markText(got: string, truth: string): Mark {
  if (!got.trim()) return "open";
  return wordKey(got) === wordKey(truth) ? "right" : "wrong";
}

/**
 * "Silver (Rookie Variation)" is Silver; "UD Canvas insert" is UD Canvas; "Orange Pulsar Prizm" is
 * Orange Pulsar; "Gold Shimmer FOTL" is Gold Shimmer (FOTL is the box it comes from).
 */
function parallelName(name: string): string {
  return words(name.replace(/\([^)]*\)/g, " "))
    .filter((word) => !["insert", "prizm", "prizms", "parallel", "fotl"].includes(word))
    .join(" ");
}

/**
 * null is a base card: nothing shown, or "Base", is right. A truth that is only the product's own
 * word ("Sapphire" on a Sapphire Edition card) is a base card of that product. Otherwise the same
 * parallel the way the app compares them: the words in any order, give or take "Border" and
 * "Refractor" (sameParallelLoosely). Nothing shown is open.
 */
export function markParallel(got: string, card: HardCard): Mark {
  const shown = parallelName(got);
  const truths = [card.parallel ?? "", ...(card.parallel_also ?? [])].map(parallelName).filter(Boolean);
  const named = Boolean(shown) && truths.some((truth) => sameParallelLoosely(truth, shown));
  const productWords = new Set(words(card.product));
  const base = truths.length === 0 || truths[0].split(" ").every((word) => productWords.has(word));
  if (base) return !shown || shown === "base" || named ? "right" : "wrong";
  if (!shown) return "open";
  return named ? "right" : "wrong";
}

/** A card that isn't numbered must show no run. A numbered one: its run, or open. */
export function markRun(got: number | null | undefined, truth: number | null): Mark {
  if (truth == null) return got == null ? "right" : "wrong";
  if (got == null) return "open";
  return got === truth ? "right" : "wrong";
}
