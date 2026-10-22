import { canonicalParallelName, parallelMatchKey } from "@/lib/cards/parallels";
import { normalizeCardNumber, setMatchPhrase } from "@/lib/comps/match";
import { money } from "@/lib/format";
import type { EbaySoldCard } from "@/lib/value/ebay-sold";
import {
  formatCardValueLabel,
  NOT_ENOUGH_SALES_LABEL,
  VALUE_UNAVAILABLE_LABEL,
} from "@/lib/value/format";
import type { CardValueResult, CardValueSale, CardValueSimilar } from "@/lib/value/types";

/** Below this, the median is not shown as the estimate. Matches the fair-price minimum. */
export const NORMAL_ESTIMATE_MIN_SALES = 3;

export const NO_SALES_FOUND_LABEL = "No sales found yet";
export const SIMILAR_CARDS_LABEL = "Similar cards";

/** One year either side counts as a nearby release. Two years does not. */
export const NEARBY_YEAR_GAP = 1;

const RANGE_DASH = "\u2013";
const USERNAME = /^[a-z0-9_]{3,20}$/;

export type PriceSale = CardValueSale;

export type PriceRead =
  | { kind: "estimate"; text: string; isEstimate: true; showEbaySold: false }
  | { kind: "last_sale"; text: string; isEstimate: false; showEbaySold: false }
  | { kind: "range"; text: string; isEstimate: false; showEbaySold: false }
  | {
      kind: "similar";
      text: typeof SIMILAR_CARDS_LABEL;
      detail: string;
      priceText: string;
      href: string;
      isEstimate: false;
      showEbaySold: false;
    }
  | {
      kind: "none";
      text: typeof NO_SALES_FOUND_LABEL;
      isEstimate: false;
      showEbaySold: boolean;
    }
  | { kind: "status"; text: string; isEstimate: false; showEbaySold: false };

export type SimilarCandidate = {
  id: string;
  username?: string | null;
  ownerId?: string | null;
  playerName: string;
  year: number;
  yearLabel?: string | null;
  setBrand: string;
  cardNumber?: string | null;
  parallel?: string | null;
  grade?: string | null;
  sales: PriceSale[];
};

type SubjectCard = {
  id?: string;
  playerName?: string | null;
  year?: number | null;
  yearLabel?: string | null;
  setBrand?: string | null;
  cardNumber?: string | null;
  parallel?: string | null;
  grade?: string | null;
};

/** "Oct 2" from an ISO timestamp. Null when the sale has no real date. */
export function saleDayLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const day = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function playerKey(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function gradeKey(grade: string | null | undefined): string {
  const text = (grade ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!text || text === "raw" || text === "ungraded" || text === "—") return "raw";
  return text;
}

function parallelKey(parallel: string | null | undefined): string {
  return parallelMatchKey(parallel || "Base") || "base";
}

function startYear(card: SubjectCard): number | null {
  const label = (card.yearLabel ?? "").trim() || String(card.year ?? "");
  const match = label.match(/^(\d{4})/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

function numberKey(value: string | null | undefined): string {
  const number = normalizeCardNumber(value);
  if (!number || number === "—") return "";
  return number;
}

function samePlayer(a: SubjectCard, b: SubjectCard): boolean {
  const left = playerKey(a.playerName);
  const right = playerKey(b.playerName);
  return Boolean(left) && left === right;
}

function sameSet(a: SubjectCard, b: SubjectCard): boolean {
  const left = setMatchPhrase(a.setBrand ?? "");
  return Boolean(left) && left === setMatchPhrase(b.setBrand ?? "");
}

/** A cent. Anything smaller is not a price. */
const MIN_PRICE = 0.01;

function isPriced(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= MIN_PRICE;
}

function pricedSales(sales: readonly PriceSale[] | null | undefined): PriceSale[] {
  if (!sales) return [];
  return sales.filter((sale) => isPriced(sale.price));
}

function salesWord(count: number): string {
  return count === 1 ? "1 sale" : `${count} sales`;
}

export function rangeLabel(low: number, high: number, count: number): string {
  const floor = Math.min(low, high);
  const ceiling = Math.max(low, high);
  const sales = Math.max(1, count);
  if (!isPriced(floor) || !isPriced(ceiling) || floor === ceiling) {
    const price = isPriced(floor) ? floor : ceiling;
    if (sales <= 1) return `${money(price)} from 1 sale`;
    return `~${money(price)} from ${salesWord(sales)}`;
  }
  return `${money(floor)}${RANGE_DASH}${money(ceiling)} from ${salesWord(sales)}`;
}

export function lastSaleLabel(price: number, soldAt: string): string | null {
  const day = saleDayLabel(soldAt);
  if (!day) return null;
  return `Last sold ${money(price)} on ${day}`;
}

/**
 * A sold search is useful when it names a player and a year or a set.
 * A bare name is not a card, so the link stays hidden.
 */
export function ebaySoldLinkIsUseful(
  card: EbaySoldCard | null | undefined,
  href: string | null | undefined,
): boolean {
  if (!href) return false;
  const player = (card?.playerName ?? "").trim();
  if (player.length < 2) return false;
  const year = (card?.yearLabel ?? "").trim() || (card?.year ? String(card.year) : "");
  const set = (card?.setBrand ?? "").trim();
  return Boolean(year || set);
}

function estimate(text: string): PriceRead {
  return { kind: "estimate", text, isEstimate: true, showEbaySold: false };
}

function status(text: string): PriceRead {
  return { kind: "status", text, isEstimate: false, showEbaySold: false };
}

function none(card: EbaySoldCard | null | undefined, href: string | null | undefined): PriceRead {
  return {
    kind: "none",
    text: NO_SALES_FOUND_LABEL,
    isEstimate: false,
    showEbaySold: ebaySoldLinkIsUseful(card, href),
  };
}

type Relation = { reason: "parallel" | "grade" | "year"; rank: number };

/** Same player, year, set, number, parallel, and grade. Another copy of this card. */
export function isSameCardIdentity(subject: SubjectCard, other: SubjectCard): boolean {
  if (!samePlayer(subject, other) || !sameSet(subject, other)) return false;
  if (numberKey(subject.cardNumber) !== numberKey(other.cardNumber)) return false;
  if (parallelKey(subject.parallel) !== parallelKey(other.parallel)) return false;
  if (gradeKey(subject.grade) !== gradeKey(other.grade)) return false;
  const subjectYear = startYear(subject);
  const otherYear = startYear(other);
  return subjectYear != null && subjectYear === otherYear;
}

export function similarRelation(subject: SubjectCard, other: SubjectCard): Relation | null {
  if (subject.id && other.id && subject.id === other.id) return null;
  if (!samePlayer(subject, other) || !sameSet(subject, other)) return null;
  if (numberKey(subject.cardNumber) !== numberKey(other.cardNumber)) return null;

  const subjectYear = startYear(subject);
  const otherYear = startYear(other);
  if (subjectYear == null || otherYear == null) return null;
  const gap = Math.abs(subjectYear - otherYear);
  const parallelDiffers = parallelKey(subject.parallel) !== parallelKey(other.parallel);
  const gradeDiffers = gradeKey(subject.grade) !== gradeKey(other.grade);

  if (gap === 0 && !parallelDiffers && !gradeDiffers) return null;
  if (gap === 0 && parallelDiffers) {
    return { reason: "parallel", rank: gradeDiffers ? 2 : 0 };
  }
  if (gap === 0 && gradeDiffers) return { reason: "grade", rank: 1 };
  if (gap === NEARBY_YEAR_GAP) return { reason: "year", rank: 3 };
  return null;
}

function displayParallel(card: SubjectCard): string {
  return canonicalParallelName(card.setBrand ?? "", card.parallel || "Base") || "Base";
}

function displayGrade(card: SubjectCard): string {
  const grade = (card.grade ?? "").trim();
  return grade || "Raw";
}

function yearText(card: SubjectCard): string {
  return (card.yearLabel ?? "").trim() || String(card.year ?? "");
}

function similarDetail(card: SubjectCard, reason: Relation["reason"]): string {
  const parallel = displayParallel(card);
  const grade = displayGrade(card);
  if (reason === "year") return [yearText(card), parallel, grade].filter(Boolean).join(" · ");
  return [parallel, grade].join(" · ");
}

function bucket(card: SubjectCard): string {
  return [yearText(card), parallelKey(card.parallel), gradeKey(card.grade)].join("|");
}

/**
 * Closest public cousin with sales: same player, year, and set with a
 * different parallel or grade, otherwise the same player and set a year away.
 * The label names that cousin's grade and parallel. No link, no offer.
 */
export function pickSimilarOffer(
  subject: SubjectCard,
  candidates: readonly SimilarCandidate[],
): CardValueSimilar | null {
  const viable = [];
  for (const candidate of candidates) {
    const username = (candidate.username ?? "").trim().toLowerCase();
    if (!USERNAME.test(username)) continue;
    const prices = pricedSales(candidate.sales);
    if (!prices.length) continue;
    const relation = similarRelation(subject, candidate);
    if (!relation) continue;
    viable.push({ candidate, relation, prices, username });
  }
  if (!viable.length) return null;

  viable.sort(
    (a, b) => a.relation.rank - b.relation.rank || b.prices.length - a.prices.length,
  );
  const best = viable[0];
  const identity = bucket(best.candidate);
  const group = viable.filter(
    (item) => item.relation.rank === best.relation.rank && bucket(item.candidate) === identity,
  );
  const prices = group.flatMap((item) => item.prices.map((sale) => sale.price));
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const link = group.slice().sort((a, b) => b.prices.length - a.prices.length)[0];
  return {
    href: `/u/${link.username}/cards/${link.candidate.id}`,
    detail: similarDetail(best.candidate, best.relation.reason),
    priceText: rangeLabel(low, high, prices.length),
    reason: best.relation.reason,
  };
}

function similarRead(offer: CardValueSimilar): PriceRead {
  return {
    kind: "similar",
    text: SIMILAR_CARDS_LABEL,
    detail: offer.detail,
    priceText: offer.priceText,
    href: offer.href,
    isEstimate: false,
    showEbaySold: false,
  };
}

function positiveAmount(value: number | null | undefined): number | null {
  return isPriced(value) ? value : null;
}

/** The stored, flag-filtered count. Extra rows from other copies do not count. */
function isNormalEstimate(
  value: CardValueResult,
): value is CardValueResult & { median: number } {
  return (
    (value.status === "ok" || value.status === "sample") &&
    value.nSales >= NORMAL_ESTIMATE_MIN_SALES &&
    typeof value.median === "number" &&
    Number.isFinite(value.median) &&
    value.median >= MIN_PRICE
  );
}

function storedCountRange(value: CardValueResult): PriceRead | null {
  if (value.status !== "ok") return null;
  if (value.nSales < 1 || value.nSales >= NORMAL_ESTIMATE_MIN_SALES) return null;
  const mid = positiveAmount(value.median);
  if (mid == null) return null;
  if (value.nSales === 1) {
    return {
      kind: "last_sale",
      text: `Last sold ${money(mid)}`,
      isEstimate: false,
      showEbaySold: false,
    };
  }
  const low = positiveAmount(value.low) ?? mid;
  const high = positiveAmount(value.high) ?? mid;
  return {
    kind: "range",
    text: rangeLabel(low, high, value.nSales),
    isEstimate: false,
    showEbaySold: false,
  };
}

/** Keep the dollar on one line and "from N sales" on the next if needed. */
export function splitFallbackLabel(text: string): string[] {
  const count = text.match(/^(.*\$.*) (from \d+ sales?)$/);
  if (count?.[1] && count[2]) return [count[1], count[2]];
  const last = text.match(/^(Last sold \$.*) (on .+)$/);
  if (last?.[1] && last[2]) return [last[1], last[2]];
  return [text];
}

/**
 * What to show when the normal estimate is not available.
 * Order: last sale (one dated sale), then a range from the few sales we have,
 * then similar cards, then "No sales found yet".
 * A fallback is never `isEstimate`.
 */
export function resolvePriceRead(input: {
  value?: CardValueResult | null;
  createdAt?: string | null;
  now?: number | Date;
  /** Pass the on-screen comps when they have loaded. Omit while they are still loading. */
  exactSales?: readonly PriceSale[] | null;
  similar?: CardValueSimilar | null;
  ebayHref?: string | null;
  card?: EbaySoldCard | null;
}): PriceRead {
  const value = input.value ?? null;
  if (value?.status === "unavailable" || value?.status === "stale") {
    return status(VALUE_UNAVAILABLE_LABEL);
  }
  if (value && isNormalEstimate(value)) {
    return estimate(money(value.median));
  }

  if (!value) {
    const early = formatCardValueLabel(null, {
      createdAt: input.createdAt,
      now: input.now,
    });
    if (early === "Value updating") return status(early);
  }

  const storedPriced = input.value?.sales ? pricedSales(input.value.sales) : undefined;
  const list =
    input.exactSales !== undefined && input.exactSales !== null
      ? pricedSales(input.exactSales)
      : storedPriced && storedPriced.length > 0
        ? storedPriced
        : undefined;

  const similar = input.similar ?? value?.similar ?? null;

  if (list && list.length === 1) {
    const day = saleDayLabel(list[0].soldAt);
    if (day) {
      return {
        kind: "last_sale",
        text: `Last sold ${money(list[0].price)} on ${day}`,
        isEstimate: false,
        showEbaySold: false,
      };
    }
    return {
      kind: "last_sale",
      text: `Last sold ${money(list[0].price)}`,
      isEstimate: false,
      showEbaySold: false,
    };
  }

  if (list && list.length >= 2) {
    const prices = list.map((sale) => sale.price);
    return {
      kind: "range",
      text: rangeLabel(Math.min(...prices), Math.max(...prices), prices.length),
      isEstimate: false,
      showEbaySold: false,
    };
  }

  if (list === undefined && value) {
    const stored = storedCountRange(value);
    if (stored) return stored;
  }

  if (similar?.href && similar.detail) return similarRead(similar);

  if (value?.status === "sample") return status(NOT_ENOUGH_SALES_LABEL);
  return none(input.card, input.ebayHref);
}

/** One compact line for a feed chip or a collection tile. */
export function feedChipPrice(read: PriceRead): { text: string; showEbaySold: boolean } {
  if (read.kind === "similar") {
    return {
      text: `${SIMILAR_CARDS_LABEL} · ${read.detail} · ${read.priceText}`,
      showEbaySold: false,
    };
  }
  return { text: read.text, showEbaySold: read.showEbaySold };
}

/** Collection tiles prefix "Est." only on the real estimate. */
export function tilePriceText(read: PriceRead, prefixEstimate = false): string {
  const chip = feedChipPrice(read).text;
  if (prefixEstimate && read.kind === "estimate") return `Est. ${chip}`;
  return chip;
}
