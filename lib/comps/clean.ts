/**
 * Compatibility shims — all matching lives in lib/comps/match.ts.
 * Sale expansion helpers remain here for older tests.
 */
import { parseGrade, RAW_GRADE } from "@/lib/card-options";
import {
  cleanMatchedResult,
  dedupeSales,
  filterComps,
  gradesMatch as gradesMatchCard,
  isLowConfidence,
  listingLooksProfessionallyGraded,
  parseGradeFromTitle,
  resolveListingGrade,
  titleHasCardNumber,
  titleHasDisallowedParallel,
  titleHashCardNumbers,
  titleLooksExcluded,
  titleMatchesCard as titleMatchesMatchCard,
  titleNamesWrongSet,
  type MatchCard,
} from "./match";
import type { CleanedSale, TrawlSoldResult } from "./types";

export {
  dedupeSales,
  isLowConfidence,
  listingLooksProfessionallyGraded,
  parseGradeFromTitle,
  resolveListingGrade,
  titleHasCardNumber,
  titleHasDisallowedParallel,
  titleHashCardNumbers,
  titleLooksExcluded,
  titleNamesWrongSet,
  escapeRegExp,
  normalizeCardNumber,
  setMatchPhrase,
  titleHasSetName,
} from "./match";

export type CleanCardFilter = {
  playerName?: string;
  year?: number;
  yearLabel?: string;
  grade?: string;
  cardNumber?: string;
  setBrand?: string;
  parallel?: string;
  serialRun?: number | null;
  isAuto?: boolean;
  isRelic?: boolean;
  conditionType?: "raw" | "graded";
  gradeQualifier?: string | null;
  noNumber?: boolean;
};

function toMatchCard(card?: CleanCardFilter | string): MatchCard {
  if (typeof card === "string") {
    return {
      playerName: "",
      year: 0,
      setBrand: "",
      grade: card,
      conditionType: parseGrade(card).company === RAW_GRADE ? "raw" : "graded",
    };
  }
  const grade = card?.grade ?? "";
  const parsed = parseGrade(grade);
  const conditionType =
    card?.conditionType ??
    (parsed.company === RAW_GRADE || !parsed.company ? "raw" : "graded");
  return {
    playerName: card?.playerName ?? "",
    year: card?.year ?? 0,
    yearLabel: card?.yearLabel,
    setBrand: card?.setBrand ?? "",
    cardNumber: card?.cardNumber,
    noNumber: card?.noNumber,
    parallel: card?.parallel,
    serialRun: card?.serialRun,
    isAuto: card?.isAuto,
    isRelic: card?.isRelic,
    conditionType,
    grade,
    gradeQualifier: card?.gradeQualifier,
  };
}

export function isRawCardGrade(cardGrade: string | undefined): boolean {
  const parsed = parseGrade(cardGrade ?? "");
  return parsed.company === RAW_GRADE || !parsed.company;
}

export function gradesMatch(
  cardGrade: string | undefined,
  detailsGrader: string | null | undefined,
  detailsGrade: string | null | undefined,
): boolean {
  return gradesMatchCard(cardGrade, detailsGrader, detailsGrade);
}

export function titleMatchesCard(
  title: string,
  card?: CleanCardFilter,
): boolean {
  if (!card) return !titleLooksExcluded(title);
  return titleMatchesMatchCard(title, toMatchCard(card));
}

export function cleanTrawlResult(
  result: TrawlSoldResult,
  cardOrGrade?: CleanCardFilter | string,
): CleanedSale[] {
  return cleanMatchedResult(result, toMatchCard(cardOrGrade));
}

export function cleanTrawlResults(
  results: TrawlSoldResult[],
  cardOrGrade?: CleanCardFilter | string,
): CleanedSale[] {
  return results.flatMap((result) => cleanTrawlResult(result, cardOrGrade));
}

export function prepareSales(
  results: TrawlSoldResult[],
  card: CleanCardFilter,
): CleanedSale[] {
  return filterComps(toMatchCard(card), results);
}
