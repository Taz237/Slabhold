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

/** The card with its known print run, when the owner saved none. A saved run always wins. */
export function withKnownRun<T extends RunCard & { serialRun?: number | null }>(card: T, products: readonly ProductRecord[] | null): T {
  if (typeof card.serialRun === "number" && card.serialRun > 0) return card;
  const run = knownPrintRun(products, card);
  return run ? { ...card, serialRun: run } : card;
}
