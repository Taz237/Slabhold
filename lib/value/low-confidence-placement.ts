/*
 * Where a card page says "Low confidence": the comp card's amber tag, or the
 * Recent sales caption, never both. No imports, so it stays light.
 */

export const LOW_CONFIDENCE_NOTE = " · Low confidence";

export type LowConfidenceState = {
  /** The count the Recent sales header shows. */
  salesCount: number;
  /** Live sold prices (not sample rows). */
  live: boolean;
  /** A low-confidence estimate is the headline value (estimate read, 1–4 sales). */
  estimate: boolean;
  /** The comp card's chart is up: its chunk loaded, sales ready, not collapsed or blocked. */
  showChart: boolean;
  /** A sale is tapped, so the chart caption shows that sale instead of its tag. */
  saleSelected: boolean;
};

function fewLiveSales(salesCount: number, live: boolean): boolean {
  return live && salesCount >= 1 && salesCount < 5;
}

/**
 * "chart" when SalesChart's amber tag is on screen, "caption" when the Recent
 * sales caption should carry the note instead, null when neither applies.
 */
export function lowConfidencePlacement(state: LowConfidenceState): "chart" | "caption" | null {
  if (state.estimate && state.showChart && !state.saleSelected) return "chart";
  return fewLiveSales(state.salesCount, state.live) ? "caption" : null;
}

/**
 * " · Low confidence" after the Recent sales caption for 1–4 live sales, unless
 * SalesChart's amber tag is on screen (`chartTagShown`), so it shows once.
 */
export function lowConfidenceNote(salesCount: number, live: boolean, chartTagShown: boolean): string {
  return !chartTagShown && fewLiveSales(salesCount, live) ? LOW_CONFIDENCE_NOTE : "";
}
