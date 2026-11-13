import { RAW_GRADE, parseYearLabel } from "@/lib/card-options";
import { dollarsToCents, filterPriceOutliers, median, middleFifty } from "@/lib/comps/stats";
import type { QuickCompIdentity } from "@/lib/quick-comp/identity";
import { NORMAL_ESTIMATE_MIN_SALES } from "@/lib/value/price-fallback";
import { gradeLabel } from "./confirm";
import type { ScanEstimateResult } from "./estimate";
import type { ScanMatch } from "./match";

/**
 * Scan to comp: what a scanned card sold for, from sales we already have.
 * Pure. The lookup (lib/scan/comp-lookup.ts) only reads caches, never Trawl,
 * so no sales means we say so instead of showing a price.
 */

export const COMP_COPY = {
  title: "Recent sold prices",
  value: "Value",
  range: "Most sold between",
  sales: "Last sales",
  basedOn: "Based on",
  fewSales: "Not enough recent sales for a value yet",
  /** After a live eBay search for this card found no matching sale. */
  noneSearched: "No sales yet",
  noneSearchedBody: "We looked at recent sold prices from the last 90 days.",
  /** No live search ran for this pick (another parallel or grade): only saved sales were checked. */
  none: "No recent sales for this one yet",
  looking: "Looking up last solds…",
  lastSold: "Last sold",
  /** The parallel was picked because most of this card's recent sold titles name it. */
  matchedFromSales: "Matched from recent sales",
  /** Scan to comp: the price shown is that parallel's, so say how to change it. */
  matchedFromSalesTap: "Matched from recent sales. Tap yours if it's different.",
  split: "Recent sales name more than one parallel",
  splitBody: "Pick yours to see its value.",
  /** The sales name just one parallel, and the card's is still open. */
  splitOne: "Recent sales name a parallel",
  splitOneBody: "Tap it if it's yours.",
  /** An unnumbered card's sales were all another parallel: Base isn't priced from them. */
  noBase: "No recent Base sales",
  /** Add card: the only sales are too far apart to call one the last sold. */
  notClean: "Not enough clean sales yet",
  noBaseBody: "Tap your parallel to see its value.",
  /** Under a Base price: what else recent sales name. */
  otherGroups: "Other parallels in recent sales",
  /** The lookup itself failed. Never shown for a search that worked and found nothing. */
  unavailable: "We couldn't load sold prices",
  unavailableBody: "The lookup didn't go through. Your card is still read.",
  retry: "Try again",
  assumedBase: "Showing Base. Tap your parallel if it's different.",
  grade: "Grade",
  add: "Add to collection",
  next: "Scan another",
  credit: "Recent sold prices via Trawl",
  checking: "Checking recent sales",
  /** Under "No sales yet": last year's same card for other players. An estimate, never this card's value. */
  estimate: "Estimate from similar cards",
  estimateNote: "Not this card's value. It isn't saved as its price.",
  estimateRange: "Similar cards sold between",
  estimateExamples: "Similar cards that sold",
  /** A numbered card with no parallel named: last year's parallels at the same print run. */
  yearAgoParallels: "Last year's parallels at this print run",
  search: "Look it up by name",
  needYear: "We need the year to show sold prices. Tap the card below that matches.",
  needPlayer: "We need the player to show sold prices. Add the card and name the player.",
} as const;

export type ScanCompSale = { priceCents: number; soldAt: string | null };

export type ScanCompSource = "quick-comp" | "sold-cache" | "collections" | "live";

export type ScanCompResult =
  | {
      status: "ok";
      /** Newest first, at most 10. */
      sales: ScanCompSale[];
      nSales: number;
      /** Null under 3 sales: a value from one or two sales would mislead. */
      medianCents: number | null;
      lowCents: number | null;
      highCents: number | null;
      trend: "up" | "down" | "flat" | null;
      asOf: string | null;
      source: ScanCompSource;
      /** The parallel these sales are for, from their titles ("Pink/Red"). */
      parallel?: string;
      /** Every parallel the search found, so Base never prices a Pink/Red. */
      groups?: { label: string; nSales: number }[];
      /** Just 2 sales, more than 10x apart: both show, but neither is a clean "Last sold". */
      unclean?: boolean;
    }
  /** searched: a live eBay search ran for this card and found no matching sale. */
  | { status: "none"; searched?: boolean }
  /**
   * The sales name more than one parallel and the card's isn't picked: each group shows,
   * the parallel stays open, and nothing is priced until the collector picks.
   */
  | {
      status: "split";
      groups: { label: string; nSales: number; lastPriceCents: number | null; lastSoldAt: string | null }[];
      /** An unnumbered card shows Base until the collector picks: "Base" when no sale was Base. */
      missing?: "Base";
    }
  /** Today's or this hour's live lookups are used up. The identity still shows. */
  | { status: "limited"; reason: "daily" | "hourly" | "safety"; resetAt: string | null }
  | { status: "unavailable" };

/**
 * The last solds for the scan's top card, from POST /api/scan/solds. Looking
 * while the live eBay search runs (a few seconds), so the identity shows first.
 */
export type SoldsState =
  | { status: "looking" }
  | { status: "done"; comp: ScanCompResult; query: string | null; similar?: ScanEstimateResult };

/** The newest sale, for the one-line "Last sold" on the Add card sheet. */
export function lastSale(result: ScanCompResult): ScanCompSale | null {
  return result.status === "ok" && !result.unclean ? (result.sales[0] ?? null) : null;
}

const MAX_SALES = 10;
const TREND_MIN_SALES = 4;
const TREND_THRESHOLD = 0.05;

/** The slab's grade, or Raw. Authentic has no number to comp, so it reads Raw. */
export function scanCompGrade(match: Pick<ScanMatch, "grade">): string {
  const grade = match.grade;
  if (!grade?.company || !grade.number) return RAW_GRADE;
  return gradeLabel({ ...grade, qualifier: "" }) ?? RAW_GRADE;
}

/** The quick comp identity for this match and grade. An open parallel prices Base and says so. */
export function compIdentityFromMatch(
  match: ScanMatch,
  grade: string,
): { identity: QuickCompIdentity; assumedBase: boolean } | null {
  const player = match.playerName.trim();
  const year = parseYearLabel(match.yearLabel);
  if (!player || !year) return null;
  const parallel = match.parallel.trim();
  return {
    identity: {
      playerName: player,
      year: year.year,
      yearLabel: year.yearLabel,
      setBrand: match.setBrand.trim(),
      cardNumber: match.cardNumber.trim(),
      parallel: parallel || "Base",
      grade,
    },
    assumedBase: !parallel,
  };
}

/** Same field names as /api/quick-comp, plus the print run the card shows (run) for the sold-listing cache. */
export function compQueryString(identity: QuickCompIdentity, serialRun?: number | null, query?: string | null): string {
  const params = new URLSearchParams();
  params.set("player", identity.playerName);
  params.set("year", identity.yearLabel);
  if (identity.setBrand) params.set("set", identity.setBrand);
  if (identity.cardNumber) params.set("number", identity.cardNumber);
  params.set("parallel", identity.parallel || "Base");
  params.set("grade", identity.grade);
  if (serialRun != null && Number.isInteger(serialRun) && serialRun > 0) params.set("run", String(serialRun));
  if (query) params.set("q", query);
  return params.toString();
}

function time(value: string | null): number {
  const ms = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ms) ? ms : Number.NaN;
}

/** Newer half of the dated sales against the older half, by median. Null under 4. */
export function trendOf(sales: readonly ScanCompSale[]): "up" | "down" | "flat" | null {
  const dated = sales.filter((sale) => Number.isFinite(time(sale.soldAt)));
  if (dated.length < TREND_MIN_SALES) return null;
  const oldestFirst = [...dated].sort((a, b) => time(a.soldAt) - time(b.soldAt));
  const half = Math.floor(oldestFirst.length / 2);
  const older = median(oldestFirst.slice(0, half).map((sale) => sale.priceCents));
  const newer = median(oldestFirst.slice(oldestFirst.length - half).map((sale) => sale.priceCents));
  if (older == null || newer == null || older <= 0) return null;
  const change = (newer - older) / older;
  if (change > TREND_THRESHOLD) return "up";
  if (change < -TREND_THRESHOLD) return "down";
  return "flat";
}

export function summarizeSales(
  raw: readonly { price: number; soldAt?: string | null }[],
  meta: { asOf: string | null; source: ScanCompSource },
): ScanCompResult {
  const priced = raw.filter((sale) => Number.isFinite(sale.price) && sale.price > 0);
  const kept = priced.length >= NORMAL_ESTIMATE_MIN_SALES ? filterPriceOutliers([...priced]) : priced;
  if (kept.length === 0) return { status: "none" };
  const sales: ScanCompSale[] = kept
    .map((sale) => ({ priceCents: dollarsToCents(sale.price), soldAt: sale.soldAt ?? null }))
    .sort((a, b) => (time(b.soldAt) || 0) - (time(a.soldAt) || 0));
  const enough = sales.length >= NORMAL_ESTIMATE_MIN_SALES;
  // The stats helpers work in dollars and round to the cent.
  const middle = enough ? middleFifty(kept.map((sale) => sale.price)) : null;
  const cents = (dollars: number | null | undefined) => (dollars == null ? null : dollarsToCents(dollars));
  return {
    status: "ok",
    sales: sales.slice(0, MAX_SALES),
    nSales: sales.length,
    medianCents: cents(middle?.median),
    lowCents: cents(middle?.p25),
    highCents: cents(middle?.p75),
    trend: trendOf(sales),
    asOf: meta.asOf,
    source: meta.source,
  };
}
