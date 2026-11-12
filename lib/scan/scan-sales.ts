import {
  gradesMatchCard,
  listingLooksProfessionallyGraded,
  resolveListingGrade,
  titleHasCardNumber,
  titleHasPlayer,
  titleLooksExcluded,
  titleSerialRuns,
} from "@/lib/comps/match";
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

const YEAR_IN_TITLE = /\b(19[5-9]\d|20[0-3]\d)(?:\s*[-/]\s*(\d{2}))?\b(?!\s*\/\s*\d)/g;

function titleYears(title: string): number[] {
  return [...title.matchAll(YEAR_IN_TITLE)].map((match) => Number(match[1]));
}

function startYear(label: string): number | null {
  const match = /^(\d{4})/.exec(label.trim());
  return match ? Number(match[1]) : null;
}

/** The parallel a sold title names, from its color and finish words and insert. "Base" when none. */
export function titleParallel(title: string, directory: readonly IndexedDirectoryPlayer[]): string {
  const read = readRawCardText([title], directory);
  const colors = [...read.parallelWords].sort((a, b) => title.toUpperCase().indexOf(a) - title.toUpperCase().indexOf(b));
  const label = parallelLabel(colors);
  if (read.insert) return label ? `${read.insert} ${label}` : read.insert;
  return label || "Base";
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
    if (titleLooksExcluded(title)) {
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
    // A run the titles corrected (OCR read /298) is unsure: a title naming no run still counts.
    const runs = match.serialRun ? titleSerialRuns(title) : [];
    if (match.serialRun && !runs.includes(match.serialRun) && !(match.runUnsure && runs.length === 0)) {
      dropped.run += 1;
      continue;
    }
    const years = titleYears(title);
    if (year && years.length > 0 && !years.includes(year)) {
      dropped.year += 1;
      continue;
    }
    if (raw) {
      if (listingLooksProfessionallyGraded(result)) {
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
    kept.push({ itemId: result.item_id, title, price, soldAt: result.date_sold ?? null, parallel: titleParallel(title, directory) });
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
