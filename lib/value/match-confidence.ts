import { parallelMatchKey } from "@/lib/cards/parallels";
import { singleSaleTrusted, type PriceSale } from "@/lib/value/price-fallback";
import type { CardValueResult } from "@/lib/value/types";

/** Saved when someone can't tell their parallel. The card shows no price. */
export const NOT_SURE_PARALLEL = "Parallel (not sure)";

/**
 * How sure we are that the sold prices are this exact card.
 * Only "strong" shows a dollar figure.
 */
export type MatchConfidence = "strong" | "weak" | "none";

export type ConfidenceCard = {
  year?: number | null;
  yearLabel?: string | null;
  setBrand?: string | null;
  parallel?: string | null;
  serialRun?: number | null;
  isAuto?: boolean | null;
};

export type ConfidenceOptions = {
  /** Checklist print run for this parallel, from product data. */
  knownRun?: number | null;
  /** The checklist says this parallel is numbered but the run changes card to card. */
  runVaries?: boolean;
  /** On-screen sales, when they have loaded. */
  sales?: readonly PriceSale[] | null;
};

export function isNotSureParallel(parallel: string | null | undefined): boolean {
  return parallelMatchKey(parallel ?? "") === parallelMatchKey(NOT_SURE_PARALLEL);
}

/** A run written into the parallel name: "Gold /10", "Black 1/1", "Superfractor". */
export function serialRunFromName(name: string | null | undefined): number | null {
  const text = (name ?? "").toLowerCase();
  if (!text.trim()) return null;
  if (/\b(?:1\s*\/\s*1|1\s+of\s+1|one\s+of\s+one|superfractor)\b/.test(text)) return 1;
  const match = text.match(/\/\s*(\d{1,4})\b/);
  if (!match) return null;
  const run = Number(match[1]);
  return run >= 1 ? run : null;
}

function hasYear(card: ConfidenceCard): boolean {
  if ((card.yearLabel ?? "").trim()) return true;
  return typeof card.year === "number" && card.year > 0;
}

function hasRun(card: ConfidenceCard): boolean {
  return typeof card.serialRun === "number" && card.serialRun > 0;
}

function isBase(parallel: string | null | undefined): boolean {
  const key = parallelMatchKey(parallel ?? "");
  return !key || key === "base";
}

/** Numbered per the checklist or the name, with no run saved. */
export function missingRun(card: ConfidenceCard, options?: ConfidenceOptions): boolean {
  if (isBase(card.parallel) || hasRun(card)) return false;
  const known = options?.knownRun;
  if (typeof known === "number" && known > 0) return true;
  if (options?.runVaries) return true;
  return serialRunFromName(card.parallel) != null;
}

export function matchConfidence(
  card: ConfidenceCard,
  value: CardValueResult | null | undefined,
  options?: ConfidenceOptions,
): MatchConfidence {
  if (isNotSureParallel(card.parallel)) return "none";
  if (!hasYear(card) || !(card.setBrand ?? "").trim()) return "none";
  if (missingRun(card, options)) return "weak";
  if (value && !singleSaleTrusted(card, value, options?.sales ?? undefined)) return "weak";
  return "strong";
}

export type ConfidenceCopy = {
  text: string;
  /** One tap to the field that would fix it. Opens Edit. */
  fix: { label: string; field: "parallel" | "serialRun" | "yearLabel" | "details" } | null;
};

export const WEAK_MATCH_TEXT = "We need one more detail to price this";
export const NO_PRICE_TEXT = "No price yet";

/** What a weak or none card says instead of a price. Null for strong. */
export function confidenceCopy(
  confidence: MatchConfidence,
  card: ConfidenceCard,
  options?: ConfidenceOptions,
): ConfidenceCopy | null {
  if (confidence === "strong") return null;
  if (confidence === "none") {
    if (isNotSureParallel(card.parallel)) {
      return {
        text: NO_PRICE_TEXT,
        fix: { label: "Pick your parallel to see a price", field: "parallel" },
      };
    }
    return { text: NO_PRICE_TEXT, fix: { label: "Add the year and set", field: "yearLabel" } };
  }
  if (missingRun(card, options)) {
    return { text: WEAK_MATCH_TEXT, fix: { label: "Add the print run", field: "serialRun" } };
  }
  return { text: WEAK_MATCH_TEXT, fix: { label: "Check the card details", field: "details" } };
}
