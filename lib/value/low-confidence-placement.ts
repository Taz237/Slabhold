/*
 * Where a card page says its value is rough (1 to 4 sales): in the value
 * line beside the price, or under Recent sales, never both. Soft words, not
 * an amber tag: thin data stays honest and calm. No imports, so it stays light.
 */

export type LowConfidenceState = {
  /** The count of sales on screen. */
  salesCount: number;
  /** Live sold prices (not sample rows). */
  live: boolean;
  /** A rough estimate is the headline value (estimate read, 1–4 sales). */
  estimate: boolean;
  /** The value section's chart is up: its chunk loaded, sales ready, not collapsed or blocked. */
  showChart: boolean;
};

function fewLiveSales(salesCount: number, live: boolean): boolean {
  return live && salesCount >= 1 && salesCount < 5;
}

/**
 * "chart" when the value line says it, "caption" when Recent sales should
 * carry the note instead, null when neither applies.
 */
export function lowConfidencePlacement(state: LowConfidenceState): "chart" | "caption" | null {
  if (state.estimate && state.showChart) return "chart";
  return fewLiveSales(state.salesCount, state.live) ? "caption" : null;
}
