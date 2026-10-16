import { cardCategory } from "./card-category";
import { isSold, profit } from "./format";
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

  const invested = held.reduce((sum, c) => sum + c.purchasePrice, 0);

  let estimatedValue = 0;
  let withoutValueCount = 0;
  for (const card of held) {
    const amount = marketValue(card, values);
    if (amount == null) {
      withoutValueCount += 1;
      continue;
    }
    estimatedValue += amount;
  }

  const realizedProfit = sold.reduce((sum, c) => sum + profit(c), 0);
  const valuedInvested = held.reduce((sum, c) => {
    const amount = marketValue(c, values);
    return amount == null ? sum : sum + c.purchasePrice;
  }, 0);
  const unrealizedProfit = estimatedValue - valuedInvested;

  return {
    invested,
    estimatedValue,
    realizedProfit,
    unrealizedProfit,
    heldCount: held.length,
    soldCount: sold.length,
    withoutValueCount,
  };
}

export function cardProfit(
  card: SportsCard,
  values?: Map<string, CardValueResult>,
): number | null {
  if (isSold(card)) return profit(card);
  const amount = marketValue(card, values);
  if (amount == null) return null;
  return amount - card.purchasePrice;
}

export function cardProfitPct(
  card: SportsCard,
  values?: Map<string, CardValueResult>,
): number | null {
  const p = cardProfit(card, values);
  if (p == null) return null;
  if (card.purchasePrice === 0) return 0;
  return p / card.purchasePrice;
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

export function sortCards(
  cards: SportsCard[],
  values?: Map<string, CardValueResult>,
) {
  return [...cards].sort((a, b) => {
    const aVal = marketValue(a, values) ?? -Infinity;
    const bVal = marketValue(b, values) ?? -Infinity;
    return bVal - aVal;
  });
}
