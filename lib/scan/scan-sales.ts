import {
  gradesMatchCard,
  listingLooksProfessionallyGraded,
  resolveListingGrade,
  titleHasCardNumber,
  titleHasPlayer,
  titleLooksExcluded,
  titleSerialRuns,
} from "@/lib/comps/match";
import { parallelMatchKey, parallelsForSet } from "@/lib/cards/parallels";
import type { TrawlSoldResult } from "@/lib/comps/types";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import { toMatchCard, type QuickCompIdentity } from "@/lib/quick-comp/identity";
import { parallelLabel, type ScanMatch } from "./match";
import { readRawCardText } from "./raw-text";

/**
 * A scanned card's sold sales from eBay results, filtered the way eBay's own
 * picture search would: same player always, the same card # and print run when
 * we know them, the same raw or grade. Titles that skip the year or the set
 * still count (eBay titles often do); a title that names a different year
 * doesn't. Then the sales are grouped by the parallel the title names, so a
 * Pink/Red /299 never prices from Base sales.
 */

export type DropReason = "junk" | "player" | "number" | "run" | "year" | "grade" | "removed";

export type ScanSale = {
  itemId: string;
  title: string;
  price: number;
  soldAt: string | null;
  /** The parallel the title names ("Pink/Red", "Base"). */
  parallel: string;
};

export type ScanSalesResult = {
  kept: ScanSale[];
  dropped: Record<DropReason, number>;
};

/**
 * Listings that aren't one copy of this card, on top of the card-page junk list: a pick-your or
 * choose listing, a break or a random case hit, a digital card, "2x".
 */
const SCAN_JUNK =
  /\b(?:lots?|bundle|you\s+pick|pick\s+your|choose|complete\s+set|team\s+set|reprint|rp|custom|proxy|digital)\b|(?<!\bfast\s)\bbreak\b|\b(?:random|spot)\b.*\bcase\s+hit\b|\bcase\s+hit\b.*\b(?:random|spot)\b|\bx\s?[2-9]\b|\b[2-9]\s?x\b/i;

/** "X-Fractor", "X Fractor", "Xfractor": a parallel, never the "x" in "2x". */
const X_FRACTOR = /\bx[\s-]*fractor\b/gi;

/** The title with any X-Fractor written as one word, for the junk checks. */
function junkText(title: string): string {
  return title.replace(X_FRACTOR, "xfractor");
}

/** A raw card never prices from these: a grader's name, "graded", "gem mint". */
const SCAN_GRADED = /\b(?:psa|bgs|sgc|cgc|csg|hga|tag|beckett|graded|slab(?:bed)?)\b|\bgem\s*mi?nt\b/i;

/**
 * Finishes a title can name that the color reader may miss. Any of them keeps a sale out of Base:
 * "Silver", "Refractor", "Mojo", "Cracked Ice".
 */
const FINISH_WORDS =
  /\b(silver|refractor|x[\s-]*fractor|holo|mojo|shimmer|wave|disco|hyper|pulsar|scope|velocity|sparkle|cracked\s+ice|blue\s+ice|ice|camo|tie[\s-]?dye|laser|lazer|neon|choice|zebra|tiger(?:\s+stripes?)?|snakeskin|nebula|no\s+huddle|kaboom|stars|vinyl|fast\s+break|prizm\s+(?:red|blue|green|gold|orange|purple|pink|black|white))\b/i;

/** A checklist parallel's name as a pattern: hyphens and spaces alike ("X-Fractor", "X Fractor", "Xfractor"). */
function namePattern(name: string): RegExp {
  const body = name
    .trim()
    .split(/[\s-]+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\s-]*");
  return new RegExp(`\\b${body}\\b`, "i");
}

/** The set's own parallels (Choice, Snakeskin, X-Fractor...), longest first, Base left out. */
function checklistNames(setBrand: string): string[] {
  return [...parallelsForSet(setBrand)]
    .filter((name) => parallelMatchKey(name) !== "base")
    .sort((a, b) => b.length - a.length);
}

const YEAR_IN_TITLE = /\b(19[5-9]\d|20[0-3]\d)(?:\s*[-/]\s*(\d{2}))?\b(?!\s*\/\s*\d)/g;

function titleYears(title: string): number[] {
  return [...title.matchAll(YEAR_IN_TITLE)].map((match) => Number(match[1]));
}

function startYear(label: string): number | null {
  const match = /^(\d{4})/.exec(label.trim());
  return match ? Number(match[1]) : null;
}

/**
 * A numbered card's sales whose titles name no color: never "Base" (a numbered card isn't), just
 * its run. The parallel stays open.
 */
export function unnamedRunLabel(run: number): string {
  return `/${run}, parallel not named`;
}

export function isUnnamedRunLabel(label: string | null | undefined): boolean {
  return Boolean(label && /^\/\d+, parallel not named$/.test(label));
}

/**
 * The parallel a sold title names, from its color and finish words and insert, then the set's own
 * checklist (Choice, Snakeskin, X-Fractor). "Base" only when the title names no parallel or finish.
 */
export function titleParallel(title: string, directory: readonly IndexedDirectoryPlayer[], setBrand = ""): string {
  const read = readRawCardText([title], directory);
  const colors = [...read.parallelWords].sort((a, b) => title.toUpperCase().indexOf(a) - title.toUpperCase().indexOf(b));
  const label = parallelLabel(colors);
  if (read.insert) return label ? `${read.insert} ${label}` : read.insert;
  if (label) {
    // In the checklist's spelling when it lists it ("X Fractor" reads "X-Fractor").
    const same = checklistNames(setBrand).find((name) => parallelMatchKey(name) === parallelMatchKey(label));
    return same ?? (/^x[\s-]*fractor$/i.test(label) ? "X-Fractor" : label);
  }
  // A parallel on the set's checklist, in the checklist's spelling.
  const listed = checklistNames(setBrand).find((name) => namePattern(name).test(title));
  if (listed) return listed;
  // A finish the color reader doesn't know still isn't Base.
  const finish = FINISH_WORDS.exec(title)?.[1];
  if (!finish) return "Base";
  if (/^x[\s-]*fractor$/i.test(finish)) return "X-Fractor";
  return finish.toLowerCase().replace(/\s+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Sold listings from a cache (title, price, day) in the shape the scan's filter reads. */
export function asTrawlResults(items: readonly { title: string; price: number; soldAt?: string | null }[]): TrawlSoldResult[] {
  return items.map((item, index) => ({
    title: item.title,
    sale_price: item.price,
    shipping_price: null,
    currency: "USD",
    condition: "",
    condition_raw: null,
    date_sold: item.soldAt ?? "",
    buying_format: "",
    item_id: `cached-${index}-${item.title}`,
    item_link: "",
    image_url: null,
    details: null,
  }));
}

/** Outliers out of one parallel's sales. Unclean: just 2 sales, more than 10x apart. */
export function guardOutliers(sales: readonly ScanSale[]): { sales: ScanSale[]; unclean: boolean } {
  if (sales.length === 2) {
    const [low, high] = [...sales].map((sale) => sale.price).sort((a, b) => a - b);
    return { sales: [...sales], unclean: low > 0 && high / low > 10 };
  }
  if (sales.length < 3) return { sales: [...sales], unclean: false };
  const sorted = sales.map((sale) => sale.price).sort((a, b) => a - b);
  const middle = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  if (!(middle > 0)) return { sales: [...sales], unclean: false };
  return { sales: sales.filter((sale) => sale.price <= middle * 4 && sale.price >= middle / 4), unclean: false };
}

function salePrice(result: TrawlSoldResult): number {
  const details = result.details;
  if (details?.best_offer_accepted && typeof details.sale_price === "number") return details.sale_price;
  return result.sale_price;
}

export function scanSalesFor(
  match: Pick<ScanMatch, "playerName" | "cardNumber" | "serialRun" | "yearLabel"> & Pick<Partial<ScanMatch>, "runUnsure">,
  identity: Pick<QuickCompIdentity, "grade"> & Partial<QuickCompIdentity>,
  results: readonly TrawlSoldResult[],
  directory: readonly IndexedDirectoryPlayer[],
): ScanSalesResult {
  const dropped: Record<DropReason, number> = { junk: 0, player: 0, number: 0, run: 0, year: 0, grade: 0, removed: 0 };
  const card = toMatchCard({
    playerName: match.playerName,
    year: startYear(match.yearLabel) ?? 0,
    yearLabel: match.yearLabel,
    setBrand: identity.setBrand ?? "",
    cardNumber: match.cardNumber,
    parallel: identity.parallel ?? "Base",
    grade: identity.grade,
  });
  const raw = card.conditionType === "raw";
  const year = startYear(match.yearLabel);
  const kept: ScanSale[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    const title = typeof result?.title === "string" ? result.title : "";
    if (!title || result.details?.listing_state === "removed") {
      dropped.removed += 1;
      continue;
    }
    if (titleLooksExcluded(junkText(title)) || SCAN_JUNK.test(junkText(title))) {
      dropped.junk += 1;
      continue;
    }
    if (!titleHasPlayer(title, match.playerName)) {
      dropped.player += 1;
      continue;
    }
    if (match.cardNumber && !titleHasCardNumber(title, match.cardNumber)) {
      dropped.number += 1;
      continue;
    }
    // A numbered card keeps only titles naming its run (the corrected one, when OCR misread it).
    if (match.serialRun && !titleSerialRuns(title).includes(match.serialRun)) {
      dropped.run += 1;
      continue;
    }
    const years = titleYears(title);
    if (year && years.length > 0 && !years.includes(year)) {
      dropped.year += 1;
      continue;
    }
    if (raw) {
      if (listingLooksProfessionallyGraded(result) || SCAN_GRADED.test(title)) {
        dropped.grade += 1;
        continue;
      }
    } else {
      const { grader, grade } = resolveListingGrade(result);
      if (!grader || !grade || !gradesMatchCard(card, grader, grade, title)) {
        dropped.grade += 1;
        continue;
      }
    }
    const key = `${result.item_id}|${result.date_sold}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const price = salePrice(result);
    if (!(price > 0)) {
      dropped.junk += 1;
      continue;
    }
    const named = titleParallel(title, directory, identity.setBrand ?? "");
    const parallel = named === "Base" && match.serialRun ? unnamedRunLabel(match.serialRun) : named;
    kept.push({ itemId: result.item_id, title, price, soldAt: result.date_sold ?? null, parallel });
  }
  return { kept, dropped };
}

export type ParallelGroup = { label: string; sales: ScanSale[] };

/** Sales by the parallel their titles name, biggest group first. */
export function groupByParallel(sales: readonly ScanSale[]): ParallelGroup[] {
  const groups = new Map<string, ParallelGroup>();
  for (const sale of sales) {
    const key = sale.parallel.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");
    const group = groups.get(key) ?? { label: sale.parallel, sales: [] };
    group.sales.push(sale);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.sales.length - a.sales.length);
}

/** The group for a picked parallel, matched by its words in any order ("Pink/Red" is "Red Pink"). */
export function groupFor(groups: readonly ParallelGroup[], parallel: string): ParallelGroup | null {
  const key = (value: string) => value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");
  return groups.find((group) => key(group.label) === key(parallel)) ?? null;
}
