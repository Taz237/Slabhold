import { titleLooksExcluded, titleSerialRuns } from "@/lib/comps/match";
import { dollarsToCents, median } from "@/lib/comps/stats";
import type { TrawlSoldResult } from "@/lib/comps/types";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import { productWord, yearBefore, type ScanMatch } from "./match";
import { cardWord, findPlayers } from "./raw-text";
import { schoolOnLine } from "./schools";
import { titleParallel } from "./scan-sales";

/**
 * A brand-new card with no sales yet: what the same card sold for LAST year, for other players.
 * The same product, the same print run or parallel, the same autograph and rookie or 1st Bowman
 * flags, raw only, players in the same sport. It is an estimate from similar cards, shown as one
 * and never saved as this card's price.
 *
 * Comparable players are matched by sport: our player list carries no positions, so a position
 * group can't be checked yet.
 */

export type ScanEstimate = {
  /** What was compared: "2025 Bowman U Chrome /10". */
  basis: string;
  nSales: number;
  medianCents: number;
  lowCents: number;
  highCents: number;
  /** Up to 3 sales, newest first, each with the player it was. */
  examples: { player: string; priceCents: number; soldAt: string | null }[];
};

/** What a no-sales lookup adds: the estimate (null without enough sales) and last year's parallels at this run. */
export type ScanEstimateResult = {
  estimate: ScanEstimate | null;
  /** Last year's parallels with the same print run, most sold first: quick picks, never preselected. */
  parallels: string[];
};

/** Sales needed before a median means anything. */
export const ESTIMATE_MIN_SALES = 3;
/** Most extra Trawl calls an estimate makes. */
export const ESTIMATE_MAX_CALLS = 2;
const MAX_EXAMPLES = 3;
const MAX_PARALLELS = 4;

type EstimateCard = Pick<ScanMatch, "playerName" | "sport" | "yearLabel" | "setBrand" | "serialRun" | "parallel" | "isAuto" | "isRookie" | "firstBowman">;

const JUNK = /\b(?:lots?|bundle|you\s+pick|pick\s+your|choose|complete\s+set|team\s+set|reprint|custom|proxy|digital|break|case\s+hit)\b|\bx\s?[2-9]\b|\b[2-9]\s?x\b/i;
const GRADED = /\b(?:psa|bgs|sgc|cgc|csg|hga|tag|beckett|graded|slab(?:bed)?)\b|\bgem\s*mi?nt\b/i;
const AUTO = /\bauto(?:graph(?:ed|s)?|s)?\b/i;
const ROOKIE = /\b(?:rc|rookie)\b/i;
const FIRST = /\b1st\b/i;

const SPORT_WORD = /\b(football|baseball|basketball|hockey)\b/i;
/** Words a sold title carries that are never part of a name. */
const TITLE_WORDS = new Set([
  "variation", "variations", "sp", "ssp", "case", "hit", "mint", "nm", "pack", "fresh", "hot", "invest", "rare", "new", "qty", "sapphire",
  "university", "u", "bowman", "topps", "panini", "numbered", "serial", "ucla", "football", "baseball", "basketball", "hockey", "wave", "refractors",
]);

/** The first two or three name-like words in a row in a sold title: "Arch Manning". "" when none. */
export function nameInTitle(title: string): string {
  const tokens = title.replace(/[^A-Za-z'\s.-]+/g, " | ").split(/\s+/).filter(Boolean);
  const isName = (word: string) => /^[A-Z][a-z'.-]+$|^[A-Z]{3,}$/.test(word) && !cardWord(word.replace(/[.']/g, "")) && !TITLE_WORDS.has(word.toLowerCase());
  for (let start = 0; start < tokens.length; start += 1) {
    let end = start;
    while (end < tokens.length && end - start < 3 && isName(tokens[end]) && !schoolOnLine(tokens[end])) end += 1;
    if (end - start >= 2) {
      return tokens
        .slice(start, end)
        .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
    }
  }
  return "";
}

/** Last year's product, or null when the card's year or set isn't known. */
function basisOf(card: EstimateCard): { year: string; set: string } | null {
  const year = yearBefore(card.yearLabel);
  return year && card.setBrand ? { year, set: card.setBrand } : null;
}

/**
 * The searches, narrowest first, at most ESTIMATE_MAX_CALLS: with the parallel when it is known,
 * then without. A card with no print run and no parallel named has nothing to compare by, so an
 * autograph searches as one and a plain base card isn't estimated at all.
 */
export function estimateQueries(card: EstimateCard): string[] {
  const basis = basisOf(card);
  if (!basis) return [];
  if (card.serialRun == null && !card.parallel && !card.isAuto) return [];
  const run = card.serialRun != null ? `/${card.serialRun}` : "";
  const flags = [card.firstBowman ? "1st" : "", card.isAuto ? "auto" : ""];
  const build = (...parts: string[]) => [basis.year, productWord(basis.set), ...parts, ...flags].filter(Boolean).join(" ");
  const queries = card.parallel ? [build(card.parallel, run), build(run)] : [build(run)];
  return [...new Set(queries)].slice(0, ESTIMATE_MAX_CALLS);
}

function setWords(setBrand: string): string[] {
  return productWord(setBrand).toLowerCase().split(/\s+/).filter(Boolean);
}

/** The title names last year's product: the year, and every word of the set ("U" may be "University"). */
function namesProduct(title: string, basis: { year: string; set: string }): boolean {
  const text = ` ${title.toLowerCase().replace(/[^a-z0-9/-]+/g, " ")} `;
  const yearStart = basis.year.slice(0, 4);
  if (!text.includes(` ${basis.year} `) && !text.includes(` ${yearStart} `)) return false;
  return setWords(basis.set).every((word) => (word === "u" ? / (?:u|university) /.test(text) : text.includes(` ${word} `)));
}

type Comparable = { player: string; price: number; soldAt: string | null; parallel: string };

/** Last year's sales that are the same kind of card, each with the player the title names. */
export function comparableSales(
  card: EstimateCard,
  results: readonly TrawlSoldResult[],
  directory: readonly IndexedDirectoryPlayer[],
): Comparable[] {
  const basis = basisOf(card);
  if (!basis) return [];
  const self = card.playerName.toLowerCase();
  const out: Comparable[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    const title = typeof result?.title === "string" ? result.title : "";
    const price = Number(result?.sale_price);
    if (!title || !Number.isFinite(price) || price <= 0) continue;
    if (seen.has(result.item_id ?? title)) continue;
    seen.add(result.item_id ?? title);
    if (titleLooksExcluded(title) || JUNK.test(title) || GRADED.test(title)) continue;
    if (result.details?.grading?.graded) continue;
    if (!namesProduct(title, basis)) continue;
    const runs = titleSerialRuns(title);
    if (card.serialRun != null ? !runs.includes(card.serialRun) : runs.length > 0) continue;
    if (AUTO.test(title) !== card.isAuto) continue;
    if (card.firstBowman && !FIRST.test(title)) continue;
    if (!card.firstBowman && card.isRookie && !ROOKIE.test(title)) continue;
    // Another sport's version of the product is not comparable.
    const sportWord = SPORT_WORD.exec(title)?.[1]?.toLowerCase();
    if (card.sport && sportWord && sportWord !== card.sport.toLowerCase()) continue;
    // A player we know (in the same sport), else the name the title prints: college players
    // aren't in our list yet. Never the scanned player's own card.
    const known = findPlayers([title], directory).filter((hit) => hit.score === 1 && !hit.more);
    if (known.length > 0 && card.sport && !known.some((hit) => hit.sport === card.sport)) continue;
    const player = known.find((hit) => !card.sport || hit.sport === card.sport)?.name ?? nameInTitle(title);
    if (!player || player.toLowerCase() === self) continue;
    out.push({ player, price, soldAt: result.date_sold ?? null, parallel: titleParallel(title, directory, basis.set) });
  }
  return out;
}

const sameParallel = (left: string, right: string) => left.toLowerCase().replace(/[^a-z]+/g, " ").trim() === right.toLowerCase().replace(/[^a-z]+/g, " ").trim();

/** The parallels last year's cards at this print run came in, most sold first. Only for a numbered card with none named. */
export function yearAgoParallels(card: EstimateCard, sales: readonly Comparable[]): string[] {
  if (card.serialRun == null || card.parallel) return [];
  const counts = new Map<string, number>();
  for (const sale of sales) if (sale.parallel && sale.parallel !== "Base") counts.set(sale.parallel, (counts.get(sale.parallel) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name).slice(0, MAX_PARALLELS);
}

/** The estimate from last year's comparable sales, or null with fewer than ESTIMATE_MIN_SALES. */
export function estimateFrom(card: EstimateCard, sales: readonly Comparable[]): ScanEstimate | null {
  const basis = basisOf(card);
  if (!basis) return null;
  const kept = card.parallel ? sales.filter((sale) => sameParallel(sale.parallel, card.parallel)) : [...sales];
  if (kept.length < ESTIMATE_MIN_SALES) return null;
  const prices = kept.map((sale) => sale.price);
  const middle = median(prices);
  if (middle == null) return null;
  const newest = [...kept].sort((a, b) => (b.soldAt ?? "").localeCompare(a.soldAt ?? ""));
  // One sale per player, so three examples are three players.
  const examples: ScanEstimate["examples"] = [];
  for (const sale of newest) {
    if (examples.some((item) => item.player === sale.player)) continue;
    examples.push({ player: sale.player, priceCents: dollarsToCents(sale.price), soldAt: sale.soldAt });
    if (examples.length >= MAX_EXAMPLES) break;
  }
  const run = card.serialRun != null ? `/${card.serialRun}` : "";
  const flags = [card.firstBowman ? "1st Bowman" : card.isRookie ? "rookie" : "", card.isAuto ? "auto" : ""];
  return {
    basis: [basis.year, basis.set, card.parallel, run, ...flags].filter(Boolean).join(" "),
    nSales: kept.length,
    medianCents: dollarsToCents(middle),
    lowCents: dollarsToCents(Math.min(...prices)),
    highCents: dollarsToCents(Math.max(...prices)),
    examples,
  };
}
