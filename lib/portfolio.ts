import { cardCategory } from "./card-category";
import { currentValue, isSold, profit } from "./format";
import type { CardCategory, PortfolioFilter, SportsCard } from "./types";

export type PortfolioTotals = {
  invested: number;
  estimatedValue: number;
  realizedProfit: number;
  unrealizedProfit: number;
  heldCount: number;
  soldCount: number;
};

export function summarize(cards: SportsCard[]): PortfolioTotals {
  const held = cards.filter((c) => !isSold(c));
  const sold = cards.filter(isSold);

  const invested = held.reduce((sum, c) => sum + c.purchasePrice, 0);
  const estimatedValue = held.reduce((sum, c) => sum + c.estimatedSellPrice, 0);
  const realizedProfit = sold.reduce((sum, c) => sum + profit(c), 0);
  const unrealizedProfit = estimatedValue - invested;

  return {
    invested,
    estimatedValue,
    realizedProfit,
    unrealizedProfit,
    heldCount: held.length,
    soldCount: sold.length,
  };
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

export function matchesFilter(card: SportsCard, filter: PortfolioFilter) {
  const p = profit(card);
  switch (filter) {
    case "held":
      return !isSold(card);
    case "sold":
      return isSold(card);
    case "profit":
      return p > 0;
    case "loss":
      return p < 0;
    default:
      return true;
  }
}

export function matchesCategory(card: SportsCard, category: "all" | CardCategory) {
  if (category === "all") return true;
  return cardCategory(card) === category;
}

export function sortCards(cards: SportsCard[]) {
  return [...cards].sort((a, b) => currentValue(b) - currentValue(a));
}
