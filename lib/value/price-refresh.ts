import { buildQueryKey } from "@/lib/comps/query-key";
import { cardIdentityKey, type IdentityCard } from "@/lib/social/card-identity";

/** Fields that change comps matching / stored query_key. */
export type PriceRefreshCard = IdentityCard & {
  id: string;
  sport?: string | null;
  yearLabel?: string | null;
  serialRun?: number | null;
  isAuto?: boolean;
  isRelic?: boolean;
  gradeQualifier?: string | null;
  conditionType?: "raw" | "graded";
};

function queryKeyCard(card: PriceRefreshCard) {
  return {
    id: card.id,
    year: card.year ?? undefined,
    yearLabel: card.yearLabel ?? undefined,
    setBrand: card.setBrand ?? undefined,
    cardNumber: card.cardNumber ?? undefined,
    grade: card.grade ?? undefined,
    parallel: card.parallel ?? undefined,
    serialRun: card.serialRun,
    isAuto: card.isAuto,
    isRelic: card.isRelic,
    gradeQualifier: card.gradeQualifier,
    conditionType: card.conditionType,
  };
}

/**
 * True when a card edit should schedule refreshCardValue (and count toward the
 * 5/hr Trawl limit). Notes, paid, photos, visibility, and tags never qualify.
 */
export function shouldRefreshCardValueOnEdit(
  before: PriceRefreshCard,
  after: PriceRefreshCard,
): boolean {
  if (cardIdentityKey(before) !== cardIdentityKey(after)) return true;
  if (buildQueryKey(queryKeyCard(before)) !== buildQueryKey(queryKeyCard(after))) {
    return true;
  }
  const sportBefore = (before.sport ?? "").trim().toLowerCase();
  const sportAfter = (after.sport ?? "").trim().toLowerCase();
  return sportBefore !== sportAfter;
}
