/** Subtitle for the Profit stat. Zero included cards is an em dash. */
export function profitCardLabel(included: number, total: number): string {
  if (included <= 0) return "—";
  return `Profit on ${included} of ${total} cards`;
}

/** Subtitle for the Invested stat, same inclusion rule as profit. */
export function investedCardLabel(included: number, total: number): string {
  if (included <= 0) return "—";
  return `Invested on ${included} of ${total} cards`;
}

export type ProfitTone = "up" | "down" | "neutral";

/** Green only when included cards net a gain. Zero cards or $0 stays neutral. */
export function profitAmountTone(included: number, profit: number): ProfitTone {
  if (included <= 0 || profit === 0) return "neutral";
  return profit > 0 ? "up" : "down";
}
