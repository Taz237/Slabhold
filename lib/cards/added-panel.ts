import { money } from "@/lib/format";
import { displayedCollectionTotal } from "@/lib/collection/displayed-value";
import { summarize } from "@/lib/portfolio";
import type { SportsCard } from "@/lib/types";
import { cardValueHasAmount, shownCardValue } from "@/lib/value/format";
import type { ConfidenceCard, ConfidenceCopy, MatchConfidence } from "@/lib/value/match-confidence";
import { saleDayLabel, type PremiumCardFields } from "@/lib/value/price-fallback";
import type { CardValueResult } from "@/lib/value/types";

/** Where Add card goes after a save. The card page shows the "Added" panel once. */
export function addedCardPath(cardId: string): string {
  return `/cards/${cardId}?added=1`;
}

/**
 * Prefetched once Review is complete. The card page is dynamic with a
 * loading boundary, so any id warms its route code and loading state.
 */
export const CARD_PAGE_PREFETCH_PATH = "/cards/prefetch";

export function isAddedParam(value: string | string[] | undefined): boolean {
  const one = Array.isArray(value) ? value[0] : value;
  return one === "1";
}

export function showAddedPanel(input: {
  added: boolean;
  owned: boolean;
  dismissed: boolean;
}): boolean {
  return input.added && input.owned && !input.dismissed;
}

export type AddedValueLine = {
  kind: "ok" | "pending" | "no_sales";
  text: string;
};

/** The new card's value from card_values. Pending until a value or a no-sales result comes back. */
export function addedValueLine(
  value: CardValueResult | null,
  loading: boolean,
  card?: PremiumCardFields | null,
): AddedValueLine {
  const amount = shownCardValue(card, value);
  if (value && amount != null) {
    const sales = value.nSales === 1 ? "1 recent sale" : `${value.nSales} recent sales`;
    return { kind: "ok", text: `Worth about ${money(amount)} based on ${sales}.` };
  }
  // A lone cheap sale on a premium card reads like no sales yet.
  const heldBack = cardValueHasAmount(value);
  if (heldBack || (!loading && value?.status === "no_sales")) {
    return { kind: "no_sales", text: "No recent sales found yet. We'll keep checking daily." };
  }
  return { kind: "pending", text: "Finding recent sales…" };
}

/**
 * The Added screen's one big price, split for display: the same figure
 * addedValueLine names ("Worth about $X based on N recent sales"), never
 * another one. Null whenever that line has no dollar figure.
 */
export function addedBigPrice(
  value: CardValueResult | null,
  card?: PremiumCardFields | null,
): { amount: string; detail: string } | null {
  const amount = shownCardValue(card, value);
  if (!value || amount == null) return null;
  return { amount: money(amount), detail: value.nSales === 1 ? "1 recent sale" : `${value.nSales} recent sales` };
}

/** The collection total, or null until at least one held card has a value. Never 0. */
function knownTotal(
  cards: SportsCard[],
  values: Map<string, CardValueResult>,
  valuesReady: boolean,
): number | null {
  if (!valuesReady) return null;
  const totals = summarize(cards, values);
  if (totals.heldCount <= totals.withoutValueCount) return null;
  const total = displayedCollectionTotal(cards, values);
  return Number.isFinite(total) && total >= 0.01 ? total : null;
}

/** "Your collection: 3 cards, about $72.00", or just the count without a real total. */
export function collectionLineText(count: number, total: number | null): string {
  const cards = `${count} card${count === 1 ? "" : "s"}`;
  if (total == null || !Number.isFinite(total) || total < 0.01) return `Your collection: ${cards}`;
  return `Your collection: ${cards}, about ${money(total)}`;
}

/** Same totals as the collection header. The total shows once at least one held card has a value. */
export function addedCollectionLine(
  cards: SportsCard[],
  values: Map<string, CardValueResult>,
  valuesReady: boolean,
): string {
  return collectionLineText(cards.length, knownTotal(cards, values, valuesReady));
}

/**
 * The reveal's collection line as numbers: the total now and the total
 * without this card, so the figure can count up from one to the other.
 * Either is null when it isn't a real value; then nothing animates.
 */
export function addedCollectionTotals(
  cards: SportsCard[],
  values: Map<string, CardValueResult>,
  valuesReady: boolean,
  cardId: string,
): { count: number; total: number | null; previous: number | null } {
  const total = knownTotal(cards, values, valuesReady);
  const others = cards.filter((item) => item.id !== cardId);
  const previous = total == null || others.length === cards.length ? null : knownTotal(others, values, valuesReady);
  return { count: cards.length, total, previous: previous != null && previous <= total! ? previous : null };
}

const COUNT_MILESTONES = [1, 10, 25, 50, 100, 250, 500] as const;

function isSlab(card: Pick<SportsCard, "conditionType">): boolean {
  return card.conditionType === "graded";
}

function isNumbered(card: Pick<SportsCard, "serialRun">): boolean {
  return typeof card.serialRun === "number" && card.serialRun >= 1;
}

/**
 * One quiet line for a moment worth naming: the 1st, 10th, 25th… card, the
 * first slab, or the first numbered card. One line per add, in that order.
 */
export function milestoneFor(cards: readonly SportsCard[], added: SportsCard): string | null {
  if (!cards.some((item) => item.id === added.id)) return null;
  const count = cards.length;
  if ((COUNT_MILESTONES as readonly number[]).includes(count)) {
    return count === 1 ? "Your first card." : `Card ${count} in your collection.`;
  }
  const others = cards.filter((item) => item.id !== added.id);
  if (isSlab(added) && !others.some(isSlab)) return "Your first slab.";
  if (isNumbered(added) && !others.some(isNumbered)) return "Your first numbered card.";
  return null;
}

export type AddedSoldPrice = { key: string; price: number; priceText: string; dateText: string | null };

/** Up to three recent sold prices, newest first, from the comps the card page already loaded. */
export function recentSoldPrices(
  comps: readonly { id?: string; soldPrice: number; soldDate: string }[] | null | undefined,
  max = 3,
): AddedSoldPrice[] {
  if (!comps) return [];
  return comps
    .filter((comp) => Number.isFinite(comp.soldPrice) && comp.soldPrice >= 0.01)
    .map((comp, index) => ({ comp, index, time: Date.parse(comp.soldDate) }))
    .sort((a, b) => (Number.isNaN(b.time) ? -1 : b.time) - (Number.isNaN(a.time) ? -1 : a.time) || a.index - b.index)
    .slice(0, max)
    .map(({ comp, index }) => ({
      key: comp.id ?? `${index}-${comp.soldDate}`,
      price: comp.soldPrice,
      priceText: money(comp.soldPrice),
      dateText: saleDayLabel(comp.soldDate),
    }));
}

export type AddedRevealLine =
  | AddedValueLine
  | { kind: "weak" | "none"; text: string; fix: { label: string; href: string } | null };

/**
 * The finish screen's value line. Only a strong match shows a dollar figure.
 * Weak and none say what's missing, with one tap to fix it on Edit.
 */
export function addedRevealLine(input: {
  cardId: string;
  value: CardValueResult | null;
  loading: boolean;
  card: (PremiumCardFields & ConfidenceCard) | null;
  confidence: MatchConfidence;
  copy: ConfidenceCopy | null;
}): AddedRevealLine {
  if (input.confidence !== "strong" && input.copy) {
    return {
      kind: input.confidence,
      text: input.copy.text,
      fix: input.copy.fix
        ? { label: input.copy.fix.label, href: `/cards/${input.cardId}/edit` }
        : null,
    };
  }
  return addedValueLine(input.value, input.loading, input.card);
}

/**
 * What "Add another" carries over: sport, player, year and set. Nothing else.
 * "Copy this card" also carries the card number (or that it has none).
 */
export type AddAnotherPrefill = { player: string; year: string; set: string; number?: string; noNumber?: boolean };

const PREFILL_MAX = 120;

function prefillText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, PREFILL_MAX);
}

/**
 * Add another opens /cards/new with the same sport, player, year and set, so
 * the next card starts on Card #. Grade, parallel, number, photo and price
 * are never carried over.
 */
export function addAnotherPath(
  card: { sport?: string | null; playerName?: string | null; yearLabel?: string | null; year?: number | null; setBrand?: string | null } | null,
): string {
  if (!card) return "/cards/new";
  const params = new URLSearchParams();
  const sport = prefillText(card.sport);
  const player = prefillText(card.playerName);
  const year = prefillText(card.yearLabel) || (card.year && card.year > 0 ? String(card.year) : "");
  const set = prefillText(card.setBrand);
  if (sport) params.set("sport", sport);
  if (player) params.set("player", player);
  if (year) params.set("year", year);
  if (set) params.set("set", set);
  const query = params.toString().replace(/\+/g, "%20");
  return query ? `/cards/new?${query}` : "/cards/new";
}

/** The Add another fields from /cards/new's query. Null without a player, or for a Search pick. */
export function addAnotherPrefill(params: {
  pick?: string;
  player?: string;
  year?: string;
  set?: string;
}): AddAnotherPrefill | null {
  if (params.pick === "1") return null;
  const player = prefillText(params.player);
  if (!player) return null;
  return { player, year: prefillText(params.year), set: prefillText(params.set) };
}

const NUMBER_MAX = 20;

function prefillNumber(value: string | null | undefined): string {
  return prefillText(value).replace(/^#/, "").trim().slice(0, NUMBER_MAX);
}

/**
 * Copy this card: the same card again, for a second parallel or grade.
 * Sport, player, year, set and the card number (or nonumber=1), so the flow
 * opens on Parallel or insert at Base. Parallel, grade, serial, photo, price,
 * notes and cert are never carried over. Add another stays addAnotherPath.
 */
export function copyCardPath(
  card:
    | {
        sport?: string | null;
        playerName?: string | null;
        yearLabel?: string | null;
        year?: number | null;
        setBrand?: string | null;
        cardNumber?: string | null;
        noNumber?: boolean | null;
      }
    | null,
): string {
  if (!card) return "/cards/new";
  const base = addAnotherPath(card);
  const number = card.noNumber ? "" : prefillNumber(card.cardNumber);
  if (!card.noNumber && !number) return base;
  const params = new URLSearchParams(base.split("?")[1] ?? "");
  if (number) params.set("num", number);
  else params.set("nonumber", "1");
  return `/cards/new?${params.toString().replace(/\+/g, "%20")}`;
}

/** Copy this card's fields from /cards/new's query. Null without a number, without a player, or for a Search pick. */
export function copyCardPrefill(params: {
  pick?: string;
  player?: string;
  year?: string;
  set?: string;
  num?: string;
  nonumber?: string;
}): Required<AddAnotherPrefill> | null {
  const kept = addAnotherPrefill(params);
  if (!kept) return null;
  const noNumber = params.nonumber === "1";
  const number = noNumber ? "" : prefillNumber(params.num);
  if (!noNumber && !number) return null;
  return { ...kept, number, noNumber };
}
