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

/** Same totals as the collection header. The total shows once at least one held card has a value. */
export function addedCollectionLine(
  cards: SportsCard[],
  values: Map<string, CardValueResult>,
  valuesReady: boolean,
): string {
  const count = `${cards.length} card${cards.length === 1 ? "" : "s"}`;
  const totals = summarize(cards, values);
  const known = valuesReady && totals.heldCount > totals.withoutValueCount;
  if (!known) return `Your collection: ${count}`;
  return `Your collection: ${count}, about ${money(displayedCollectionTotal(cards, values))}`;
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
