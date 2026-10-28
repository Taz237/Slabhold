import { money } from "@/lib/format";
import { displayedCollectionTotal } from "@/lib/collection/displayed-value";
import { summarize } from "@/lib/portfolio";
import type { SportsCard } from "@/lib/types";
import { cardValueHasAmount, shownCardValue } from "@/lib/value/format";
import type { PremiumCardFields } from "@/lib/value/price-fallback";
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
