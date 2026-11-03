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
  /** "Raw", "PSA 10", "BGS 9.5" and the like. */
  grade: string;
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
    conditionType: isRawGrade(identity.grade) ? "raw" : "graded",
  });
}

export function toMatchCard(identity: QuickCompIdentity): MatchCard {
  const raw = isRawGrade(identity.grade);
  return {
    playerName: identity.playerName,
    year: identity.year,
    yearLabel: identity.yearLabel,
    setBrand: identity.setBrand,
    cardNumber: identity.cardNumber,
    noNumber: !identity.cardNumber.trim(),
    parallel: identity.parallel || "Base",
    conditionType: raw ? "raw" : "graded",
    grade: raw ? RAW_GRADE : identity.grade,
  };
}

/** The shape the shared sample payload takes. Empty id: it is never a real card. */
export function toSoldCompCard(identity: QuickCompIdentity): SoldCompCard {
  return { id: "", ...toMatchCard(identity) };
}
