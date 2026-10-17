import { cardCategory } from "./card-category";
import { hasPaid, isSold, profit } from "./format";
import type { CardCategory, PortfolioFilter, SportsCard } from "./types";
import { cardValueHasAmount } from "./value/format";
import type { CardValueResult } from "./value/types";

export type PortfolioTotals = {
  invested: number;
  estimatedValue: number;
  realizedProfit: number;
  unrealizedProfit: number;
  heldCount: number;
  soldCount: number;
  withoutValueCount: number;
  /** Cards excluded from Invested / Profit because hasPaid is false. */
  unpaidExcludedCount: number;
  /** Cards with hasPaid and a current value (market median or sold price). */
  pricedCount: number;
  /** Purchase prices of pricedCount cards. Matches the profit inclusion set. */
  pricedInvested: number;
};

function marketValue(
  card: SportsCard,
  values?: Map<string, CardValueResult>,
): number | null {
  if (isSold(card)) return card.sellPrice;
  const v = values?.get(card.id);
  if (cardValueHasAmount(v)) return v.median;
  return null;
}

export function summarize(
  cards: SportsCard[],
  values?: Map<string, CardValueResult>,
): PortfolioTotals {
  const held = cards.filter((c) => !isSold(c));
  const sold = cards.filter(isSold);

  const unpaidExcludedCount = cards.filter((c) => !hasPaid(c)).length;

  const invested = held.reduce(
    (sum, c) => (hasPaid(c) ? sum + (c.purchasePrice as number) : sum),
    0,
  );

  let estimatedValue = 0;
  let withoutValueCount = 0;
  let profitValue = 0;
  let valuedInvested = 0;
  let pricedCount = 0;
  let pricedInvested = 0;
  for (const card of held) {
    const amount = marketValue(card, values);
    if (amount == null) {
      withoutValueCount += 1;
      continue;
    }
    estimatedValue += amount;
    if (hasPaid(card)) {
      profitValue += amount;
      valuedInvested += card.purchasePrice as number;
      pricedCount += 1;
      pricedInvested += card.purchasePrice as number;
    }
  }

  for (const card of sold) {
    if (!hasPaid(card) || card.sellPrice == null) continue;
    pricedCount += 1;
    pricedInvested += card.purchasePrice as number;
  }

  const realizedProfit = sold.reduce((sum, c) => {
    if (!hasPaid(c)) return sum;
    return sum + profit(c);
  }, 0);
  const unrealizedProfit = profitValue - valuedInvested;

  return {
    invested,
    estimatedValue,
    realizedProfit,
    unrealizedProfit,
    heldCount: held.length,
    soldCount: sold.length,
    withoutValueCount,
    unpaidExcludedCount,
    pricedCount,
    pricedInvested,
  };
}

export function cardProfit(
  card: SportsCard,
  values?: Map<string, CardValueResult>,
): number | null {
  if (!hasPaid(card)) return null;
  if (isSold(card)) return profit(card);
  const amount = marketValue(card, values);
  if (amount == null) return null;
  return amount - (card.purchasePrice as number);
}

export function cardProfitPct(
  card: SportsCard,
  values?: Map<string, CardValueResult>,
): number | null {
  const p = cardProfit(card, values);
  if (p == null || !hasPaid(card)) return null;
  return p / (card.purchasePrice as number);
}

export function matchesQuery(card: SportsCard, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    card.playerName,
    card.setBrand,
    String(card.year),
    card.cardNumber,
    card.grade,
    card.parallel,
    card.sport,
    card.notes,
    cardCategory(card) === "pc" ? "pc personal collection" : "flipping for sale",
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export function matchesFilter(
  card: SportsCard,
  filter: PortfolioFilter,
  values?: Map<string, CardValueResult>,
) {
  const p = cardProfit(card, values);
  switch (filter) {
    case "held":
      return !isSold(card);
    case "sold":
      return isSold(card);
    case "profit":
      return p != null && p > 0;
    case "loss":
      return p != null && p < 0;
    default:
      return true;
  }
}

export function matchesCategory(card: SportsCard, category: "all" | CardCategory) {
  if (category === "all") return true;
  return cardCategory(card) === category;
}

/** Stable newest-first order (not by market value). */
export function sortCards(cards: SportsCard[]) {
  return [...cards].sort((a, b) => {
    const byDate = b.createdAt.localeCompare(a.createdAt);
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id);
  });
}
