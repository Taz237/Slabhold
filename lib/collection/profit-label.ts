import { hasPaid, money, signedMoney } from "@/lib/format";

/** Subtitle for the Profit stat. Zero included cards is an em dash. */
export function profitCardLabel(included: number, total: number): string {
  if (included <= 0) return "—";
  return `Profit on ${included} of ${total} cards`;
}

/** Subtitle for the Invested stat. Counts every card with a price paid. */
export function investedCardLabel(paidCount: number, total: number): string {
  if (paidCount <= 0) return "";
  return `Invested on ${paidCount} of ${total} cards`;
}

/** Sum of purchase prices where hasPaid. Sold cards count. */
export function sumPaid(
  cards: { purchasePrice?: number | null }[],
): number {
  return cards.reduce((sum, card) => {
    if (!hasPaid(card)) return sum;
    return sum + (card.purchasePrice as number);
  }, 0);
}

/** Total Invested always shows the paid sum, including $0. */
export function investedAmountLabel(amount: number): string {
  return money(amount);
}

/** Profit shows an em dash until at least one card has a paid price and a value. */
export function profitAmountLabel(pricedCount: number, profit: number): string {
  if (pricedCount <= 0) return "—";
  return signedMoney(profit);
}

export type ProfitTone = "up" | "down" | "neutral";

/** Green only when included cards net a gain. Zero cards or $0 stays neutral. */
export function profitAmountTone(included: number, profit: number): ProfitTone {
  if (included <= 0 || profit === 0) return "neutral";
  return profit > 0 ? "up" : "down";
}
