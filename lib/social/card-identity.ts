import { parseGrade, RAW_GRADE } from "@/lib/card-options";
import {
  normalizeCardNumber,
  setMatchPhrase,
  yearLabelOf,
} from "@/lib/comps/match";

/** Fields that decide whether two copies are the same card. */
export type IdentityCard = {
  playerName?: string | null;
  year?: number | null;
  yearLabel?: string | null;
  setBrand?: string | null;
  cardNumber?: string | null;
  parallel?: string | null;
  conditionType?: string | null;
  grade?: string | null;
  grader?: string | null;
};

/**
 * Same physical card: player, year, set, number, parallel, and condition.
 * Parts are lowercase and trimmed. Set aliases and season labels reuse the comps helpers.
 */
export function cardIdentityKey(card: IdentityCard): string {
  return [
    ownershipMatchKey(card),
    identityCondition(card),
  ].join("|");
}

/**
 * Same collectible across grades: player, year/season, set, number, parallel.
 * Used for "Owned by" lists — any grade matches.
 */
export function ownershipMatchKey(card: IdentityCard): string {
  return [
    (card.playerName ?? "").trim().toLowerCase(),
    identityYear(card),
    setMatchPhrase(card.setBrand ?? "").toLowerCase(),
    normalizeCardNumber((card.cardNumber ?? "").trim()).toLowerCase(),
    identityParallel(card.parallel),
  ].join("|");
}

function identityYear(card: IdentityCard): string {
  return yearLabelOf({
    playerName: card.playerName ?? "",
    year: Number(card.year) || 0,
    yearLabel: card.yearLabel ?? "",
    setBrand: card.setBrand ?? "",
  })
    .trim()
    .toLowerCase();
}

function identityParallel(parallel: string | null | undefined): string {
  const value = (parallel ?? "").trim().toLowerCase();
  return value || "base";
}

function identityCondition(card: IdentityCard): string {
  const gradeText = (card.grade ?? "").trim();
  const parsed = parseGrade(gradeText);
  const condition = (card.conditionType ?? "").trim().toLowerCase();
  const raw =
    condition === "raw" ||
    (condition !== "graded" &&
      (parsed.company === RAW_GRADE || (!parsed.company && !gradeText)));
  if (raw) return "raw";
  const grader = (card.grader || parsed.company || "").trim().toLowerCase();
  const number = parsed.number.trim().toLowerCase();
  if (!grader) return number || "raw";
  return number ? `${grader} ${number}` : grader;
}
