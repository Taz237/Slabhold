import { compsIdentityKey } from "@/lib/comps/comps-result-cache";
import type { MatchCard } from "@/lib/comps/match";
import type { SoldCompCard } from "@/lib/comps/types";
import { parseGrade, RAW_GRADE } from "@/lib/card-options";

/** The card being comped. Not a row in `cards`, so it has no id. */
export type QuickCompIdentity = {
  playerName: string;
  year: number;
  yearLabel: string;
  setBrand: string;
  cardNumber: string;
  parallel: string;
  /** The print run of the picked version ("/175"). Null or missing: unnumbered, or not known. */
  serialRun?: number | null;
  /** "Raw", "PSA 10", "BGS 9.5" and the like. */
  grade: string;
  /**
   * The insert the card is in ("Rookie Code"), when the scan knows it. Only its titles are its
   * sales (lib/scan/scan-sales.ts). Not part of any cache key: it narrows, never widens.
   */
  insertName?: string;
};

export function isRawGrade(grade: string): boolean {
  const text = grade.trim();
  return !text || parseGrade(text).company === RAW_GRADE;
}

/** Grade, parallel and the rest each change the key. No user id, no card id. */
export function quickCompIdentityKey(identity: QuickCompIdentity): string {
  return compsIdentityKey({
    playerName: identity.playerName,
    year: identity.year,
    yearLabel: identity.yearLabel,
    setBrand: identity.setBrand,
    cardNumber: identity.cardNumber,
    parallel: identity.parallel || "Base",
    grade: identity.grade,
    serialRun: identity.serialRun ?? null,
    conditionType: isRawGrade(identity.grade) ? "raw" : "graded",
  });
}

/**
 * `openRun` is Quick Comp's own lookup: a named version whose print run we don't know takes
 * sales with or without one. The scanner leaves it off: there, no run read means none counted.
 */
export function toMatchCard(identity: QuickCompIdentity, options: { openRun?: boolean } = {}): MatchCard {
  const raw = isRawGrade(identity.grade);
  const parallel = identity.parallel || "Base";
  const named = parallel.trim().toLowerCase() !== "base";
  const run = typeof identity.serialRun === "number" && identity.serialRun > 0 ? identity.serialRun : null;
  return {
    // A named version keeps its run when we know it. When we don't, a sale may print one or not.
    ...(run ? { serialRun: run } : named && options.openRun ? { anyRun: true } : {}),
    playerName: identity.playerName,
    year: identity.year,
    yearLabel: identity.yearLabel,
    setBrand: identity.setBrand,
    cardNumber: identity.cardNumber,
    noNumber: !identity.cardNumber.trim(),
    parallel,
    conditionType: raw ? "raw" : "graded",
    grade: raw ? RAW_GRADE : identity.grade,
  };
}

/** The shape the shared sample payload takes. Empty id: it is never a real card. */
export function toSoldCompCard(identity: QuickCompIdentity): SoldCompCard {
  return { id: "", ...toMatchCard(identity) };
}
