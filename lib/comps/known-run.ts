import { parallelMatchKey, sameParallelLoosely } from "@/lib/cards/parallels";
import { displayParallelName, parallelsIn, productPhrase, sameSeason, type ProductRecord } from "@/lib/cards/product-data";
import type { MatchCard } from "./match";

type RunCard = Pick<MatchCard, "yearLabel" | "year" | "setBrand" | "cardNumber" | "parallel" | "sport">;

/**
 * The print run the checklist gives this card's parallel ("Gold Refractor" in 2025 Topps Chrome
 * is /50). The exact name first, else the one name that matches give or take "Refractor" or
 * "Border" ("Gold" is Gold Refractor). Null for Base, an unnumbered or unknown parallel, a run
 * that varies, or lists that disagree. With no sport saved, every list for that year and set
 * has to agree.
 */
export function knownPrintRun(products: readonly ProductRecord[] | null, card: RunCard): number | null {
  const parallel = (card.parallel ?? "").trim();
  if (!products?.length || !parallel || parallelMatchKey(parallel) === "base") return null;
  const yearLabel = (card.yearLabel ?? "").trim() || (card.year > 0 ? String(card.year) : "");
  const phrase = productPhrase(card.setBrand);
  if (!yearLabel || !phrase) return null;
  const sport = (card.sport ?? "").trim().toLowerCase();
  const lists = products.filter(
    (product) =>
      sameSeason(product.yearLabel, yearLabel) &&
      productPhrase(product.product) === phrase &&
      (!sport || product.sport.trim().toLowerCase() === sport),
  );
  if (lists.length === 0) return null;
  const runs = new Set<number | null>();
  for (const product of lists) {
    const options = parallelsIn([product], product.sport, product.yearLabel, product.product, card.cardNumber);
    const key = parallelMatchKey(displayParallelName(parallel));
    const exact = options.filter((option) => parallelMatchKey(option.name) === key);
    const found = exact.length > 0 ? exact : options.filter((option) => sameParallelLoosely(option.name, parallel));
    if (found.length !== 1) return null;
    runs.add(found[0].runVaries ? null : found[0].serialRun);
  }
  const [run] = [...runs];
  return runs.size === 1 && typeof run === "number" && run > 0 ? run : null;
}

/**
 * The card with its known print run, when the owner saved none, marked as from the checklist: its
 * sold filter also keeps titles that print no run (sellers often leave "/50" out). A saved run
 * always wins and keeps the strict rule.
 */
export function withKnownRun<T extends RunCard & { serialRun?: number | null; runFromChecklist?: boolean }>(
  card: T,
  products: readonly ProductRecord[] | null,
): T {
  if (typeof card.serialRun === "number" && card.serialRun > 0) return card;
  const run = knownPrintRun(products, card);
  return run ? { ...card, serialRun: run, runFromChecklist: true } : card;
}

/**
 * The card as its sold filter needs it: its known print run (withKnownRun), and the other parallels
 * on its own product list, so a sale that names one of them is never counted as this card's
 * (MatchCard.otherParallels). With no list for the card it is the card, unchanged.
 */
export function withProductList<T extends RunCard & { serialRun?: number | null; runFromChecklist?: boolean; otherParallels?: readonly string[] }>(
  card: T,
  products: readonly ProductRecord[] | null,
): T {
  const known = withKnownRun(card, products);
  const others = otherListedParallels(products, card);
  return others.length > 0 ? { ...known, otherParallels: others } : known;
}

/** Base subsets and tiers a product list carries beside its parallels: never a parallel a title is rejected for. */
const BASE_LEVELS = new Set(["base", "rated rookie", "rated rookies", "concourse", "premier", "premier level", "club level", "field level", "suite level", "courtside"]);

/**
 * Every other parallel on the card's own product list (its year, set and sport, and its card #'s
 * prefix): the names a sold title must not carry to be this card's sale (MatchCard.otherParallels).
 * Left out: Base, the card's own parallel (give or take "Refractor" or "Border"), and a tier's own
 * name (Select's "Field Level"). Empty with no list for the card.
 */
export function otherListedParallels(products: readonly ProductRecord[] | null, card: RunCard): string[] {
  const own = displayParallelName((card.parallel ?? "").trim() || "Base");
  return listedParallelNames(products, card).filter((name) => parallelMatchKey(name) !== parallelMatchKey(own) && !sameParallelLoosely(name, own));
}

/**
 * Every parallel on the card's own product list (its year, set and sport, and its card #'s prefix),
 * by name: what a sold title can call a version of this card. Base and a tier's own name (Select's
 * "Field Level") are left out. Empty with no list for the card.
 */
export function listedParallelNames(products: readonly ProductRecord[] | null | undefined, card: Omit<RunCard, "parallel">): string[] {
  if (!products?.length) return [];
  const yearLabel = (card.yearLabel ?? "").trim() || (card.year > 0 ? String(card.year) : "");
  const phrase = productPhrase(card.setBrand);
  if (!yearLabel || !phrase) return [];
  const sport = (card.sport ?? "").trim().toLowerCase();
  const names = new Map<string, string>();
  for (const product of products) {
    if (!sameSeason(product.yearLabel, yearLabel) || productPhrase(product.product) !== phrase) continue;
    if (sport && product.sport.trim().toLowerCase() !== sport) continue;
    const options = parallelsIn([product], product.sport, product.yearLabel, product.product, card.cardNumber);
    const keys = options.map((option) => parallelMatchKey(option.name));
    options.forEach((option, index) => {
      const key = keys[index];
      if (!key || BASE_LEVELS.has(key)) return;
      // A tier (three or more names start with it) is where the card sits in the set, not a parallel.
      if (keys.filter((other) => other.startsWith(`${key} `)).length >= 3 && option.serialRun == null) return;
      if (!names.has(key)) names.set(key, option.name);
    });
  }
  return [...names.values()];
}
