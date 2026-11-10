import { parseGrade } from "@/lib/card-options";
import { isSold } from "@/lib/format";
import { isRawCard, normalizeCardNumber, type MatchCard } from "./match";

/** Why a card cannot use a paid sold-comps lookup. */
export type TrawlSkipReason = "sold" | "no_number" | "unparsed_grade";

export type TrawlGuardCard = Pick<MatchCard, "cardNumber" | "noNumber" | "grade" | "conditionType"> & {
  sellPrice?: number | null;
  sellDate?: string | null;
  soldAt?: string | null;
};

/**
 * Cards a Trawl lookup cannot help, checked before any paid call:
 * - sold cards (totals use the sale price, not market comps);
 * - cards with no card number (the search would match the whole set);
 * - graded cards whose grade does not parse (no grade to match sales on).
 * Null when the card can use a lookup.
 */
export function trawlSkipReason(card: TrawlGuardCard): TrawlSkipReason | null {
  if (isSold({ sellPrice: card.sellPrice ?? null, sellDate: card.sellDate ?? null, soldAt: card.soldAt ?? null })) {
    return "sold";
  }
  if (card.noNumber || !normalizeCardNumber(card.cardNumber)) return "no_number";
  const graded = !isRawCard({ playerName: "", year: 0, setBrand: "", ...card });
  if (graded && !parseGrade(card.grade ?? "").recognized) return "unparsed_grade";
  return null;
}
