import { money } from "@/lib/format";
import { NOT_ENOUGH_SALES_LABEL } from "@/lib/value/format";
import { middleFifty } from "./stats";

export type FairPriceVerdict = "Below" | "Fair" | "Above";

export type FairPriceResult =
  | {
      status: "ready";
      verdict: FairPriceVerdict;
      low: number;
      high: number;
      count: number;
      rangeLabel: string;
      summaryLabel: string;
    }
  | {
      status: "not_enough";
      label: typeof NOT_ENOUGH_SALES_LABEL;
    };

export const FAIR_PRICE_MIN_SALES = 3;

/**
 * Compare a typed price to the middle-50% band (p25–p75) of matched comps.
 * Edges are inclusive: price === p25 or p75 is Fair.
 * Needs at least FAIR_PRICE_MIN_SALES matched sales.
 */
export function fairPriceCheck(
  price: number,
  salePrices: readonly number[],
): FairPriceResult {
  if (!Number.isFinite(price) || price < 0) {
    return { status: "not_enough", label: NOT_ENOUGH_SALES_LABEL };
  }
  const prices = salePrices.filter((p) => Number.isFinite(p) && p >= 0);
  if (prices.length < FAIR_PRICE_MIN_SALES) {
    return { status: "not_enough", label: NOT_ENOUGH_SALES_LABEL };
  }

  const { p25, p75 } = middleFifty([...prices]);
  if (p25 == null || p75 == null) {
    return { status: "not_enough", label: NOT_ENOUGH_SALES_LABEL };
  }

  const low = Math.min(p25, p75);
  const high = Math.max(p25, p75);
  let verdict: FairPriceVerdict = "Fair";
  if (price < low) verdict = "Below";
  else if (price > high) verdict = "Above";

  const rangeLabel = `recent sales ${money(low)} to ${money(high)}`;
  return {
    status: "ready",
    verdict,
    low,
    high,
    count: prices.length,
    rangeLabel,
    summaryLabel: `${verdict}: ${rangeLabel}`,
  };
}

/** Feed copy for a price check, e.g. for Share to feed. */
export function fairPriceShareBody(input: {
  price: number;
  yearLabel: string;
  setBrand: string;
  playerName: string;
  cardNumber: string;
  grade: string;
  result: Extract<FairPriceResult, { status: "ready" }>;
}): string {
  const year = input.yearLabel.trim() || "";
  const set = input.setBrand.trim();
  const player = input.playerName.trim();
  const num = input.cardNumber.trim();
  const numPart = num && num !== "—" ? `#${num.replace(/^#/, "")}` : "";
  const grade = (input.grade || "Raw").trim() || "Raw";
  const cardLine = [year, set, player, numPart, grade].filter(Boolean).join(" ");
  return `Price check: ${money(input.price)} for ${cardLine}. Slabhold says ${input.result.verdict} (recent ${money(input.result.low)} to ${money(input.result.high)})`;
}
