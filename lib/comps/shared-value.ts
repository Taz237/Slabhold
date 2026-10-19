import { money } from "@/lib/format";
import type { CompListing } from "@/lib/types";
import {
  cardValueHasAmount,
  NOT_ENOUGH_SALES_LABEL,
} from "@/lib/value/format";
import type { CardValueResult } from "@/lib/value/types";
import { cleanedToCompListings } from "./map";
import { filterComps, matchComps, type MatchCard } from "./match";
import { middleFifty } from "./stats";
import type { CleanedSale, TrawlSoldResult } from "./types";

export { NOT_ENOUGH_SALES_LABEL };

/** One sale that went into the estimate: the date, price, and grade on screen. */
export type SaleBasis = {
  date: string;
  price: number;
  grade: string;
};

export type SharedCompValue = {
  sales: CleanedSale[];
  basis: SaleBasis[];
  median: number | null;
  low: number | null;
  high: number | null;
  count: number;
};

const LISTING_GRADE_RE = /^(PSA|BGS|SGC|CGC|TAG|HGA)\s*(\d+(?:\.\d+)?)/i;

function roundStat(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value);
}

export function listingGrade(condition: string | null | undefined): string {
  const text = (condition ?? "").trim();
  if (!text || text === "—") return "Raw";
  return text;
}

export function gradeText(
  grader: string | null | undefined,
  grade: string | null | undefined,
): string {
  const text = [grader, grade]
    .filter((part) => part != null && String(part).trim() !== "")
    .join(" ");
  return text || "Raw";
}

export function compListingToCleaned(comp: CompListing): CleanedSale {
  const match = comp.condition.match(LISTING_GRADE_RE);
  const soldAt = comp.soldDate.includes("T")
    ? comp.soldDate
    : `${comp.soldDate}T00:00:00.000Z`;
  return {
    itemId: comp.itemId,
    title: comp.title,
    price: comp.soldPrice,
    currency: "$",
    soldAt,
    grader: match ? match[1].toUpperCase() : null,
    grade: match ? match[2] : null,
    url: comp.url,
  };
}

function basisFromCleaned(sales: CleanedSale[]): SaleBasis[] {
  return sales.map((sale) => ({
    date: sale.soldAt.slice(0, 10),
    price: sale.price,
    grade: gradeText(sale.grader, sale.grade),
  }));
}

function statsFromPrices(prices: number[]): {
  median: number | null;
  low: number | null;
  high: number | null;
  count: number;
} {
  if (!prices.length) {
    return { median: null, low: null, high: null, count: 0 };
  }
  const stats = middleFifty(prices);
  return {
    median: roundStat(stats.median),
    low: roundStat(stats.p25),
    high: roundStat(stats.p75),
    count: prices.length,
  };
}

/**
 * Filter comps to this card and price that exact set.
 * Player, set, parallel, and grade all have to match.
 * A PSA 10 keeps PSA 10 sales only. Raw keeps raw sales only.
 */
export function sharedCompValue(
  card: MatchCard,
  comps: TrawlSoldResult[] | CleanedSale[],
): SharedCompValue {
  const sales = filterComps(card, comps);
  const stats = statsFromPrices(sales.map((sale) => sale.price));
  return {
    sales,
    basis: basisFromCleaned(sales),
    ...stats,
  };
}

export function basisFromListings(comps: CompListing[]): SaleBasis[] {
  return comps.map((comp) => ({
    date: comp.soldDate.slice(0, 10),
    price: comp.soldPrice,
    grade: listingGrade(comp.condition),
  }));
}

/** Price exactly the listings on screen. Does not add or drop rows. */
export function screenValueFromComps(
  comps: CompListing[],
  hiddenItemIds?: ReadonlySet<string>,
): {
  comps: CompListing[];
  basis: SaleBasis[];
  median: number | null;
  low: number | null;
  high: number | null;
  count: number;
} {
  const visible = hiddenItemIds
    ? comps.filter((comp) => !hiddenItemIds.has(comp.itemId))
    : comps;
  const stats = statsFromPrices(visible.map((comp) => comp.soldPrice));
  return {
    comps: visible,
    basis: basisFromListings(visible),
    ...stats,
  };
}

/**
 * Dollar label for the same rounded median the card page shows.
 * Empty when the shared filter kept no sales.
 */
export function displayedCompLabel(
  card: MatchCard,
  comps: TrawlSoldResult[] | CleanedSale[],
): string {
  const valued = sharedCompValue(card, comps);
  if (valued.median == null || valued.count < 1) return NOT_ENOUGH_SALES_LABEL;
  return money(valued.median, true);
}

/**
 * Re-match listings to this card. Skips the price-outlier pass because
 * sharedCompValue already ran it once on the server payload.
 */
export function listingsForCard(
  card: MatchCard,
  comps: CompListing[],
): CompListing[] {
  const sales = matchComps(card, comps.map(compListingToCleaned));
  return cleanedToCompListings(sales);
}

export function basedOnSalesLabel(count: number): string {
  return `Based on ${count} sale${count === 1 ? "" : "s"}`;
}

/**
 * Dollar amount from a card_values row written by sharedCompValue.
 * No number unless that run kept at least one matching sale.
 */
export function amountFromStoredCompValue(
  value: CardValueResult | null | undefined,
): number | null {
  if (!cardValueHasAmount(value)) return null;
  return value.median;
}

export type ResolvedCardValue = {
  /** comps: the sales list is the source. stored: last helper result, no list. */
  phase: "loading" | "comps" | "stored" | "unavailable";
  comps: CompListing[] | null;
  basis: SaleBasis[];
  amount: number | null;
  low: number | null;
  high: number | null;
  count: number;
  emptyLabel: typeof NOT_ENOUGH_SALES_LABEL | null;
};

/**
 * Card-page sales list plus the persisted card_values amount.
 * The dollar amount is never recomputed from the listings on screen.
 */
export function resolveCardScreenValue(input: {
  phase: "loading" | "ready" | "auth" | "unavailable" | "idle";
  comps: CompListing[] | null;
  /** When set, listings are re-matched (no second outlier pass) before pricing. */
  card?: MatchCard | null;
  hiddenItemIds?: ReadonlySet<string>;
  stored?: CardValueResult | null;
}): ResolvedCardValue {
  if (input.phase === "loading" || input.phase === "idle") {
    return {
      phase: "loading",
      comps: null,
      basis: [],
      amount: null,
      low: null,
      high: null,
      count: 0,
      emptyLabel: null,
    };
  }

  if (input.phase === "ready") {
    const source = input.comps ?? [];
    const matched = input.card ? listingsForCard(input.card, source) : source;
    const visible = input.hiddenItemIds
      ? matched.filter((comp) => !input.hiddenItemIds!.has(comp.itemId))
      : matched;
    const amount = amountFromStoredCompValue(input.stored);
    return {
      phase: "comps",
      comps: visible,
      basis: [],
      amount,
      low: amount != null ? (input.stored?.low ?? null) : null,
      high: amount != null ? (input.stored?.high ?? null) : null,
      count: amount != null ? (input.stored?.nSales ?? 0) : 0,
      emptyLabel: amount == null ? NOT_ENOUGH_SALES_LABEL : null,
    };
  }

  const amount = amountFromStoredCompValue(input.stored);
  return {
    phase: input.phase === "unavailable" ? "unavailable" : "stored",
    comps: null,
    basis: [],
    amount,
    low: amount != null ? (input.stored?.low ?? null) : null,
    high: amount != null ? (input.stored?.high ?? null) : null,
    count: amount != null ? (input.stored?.nSales ?? 0) : 0,
    emptyLabel: amount == null ? NOT_ENOUGH_SALES_LABEL : null,
  };
}
