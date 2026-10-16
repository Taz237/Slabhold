import { parseGrade, RAW_GRADE } from "@/lib/card-options";
import type { CleanedSale, TrawlSoldResult } from "./types";

/** Whole-word title exclusions (case-insensitive). */
const TITLE_EXCLUDE =
  /\b(?:lot|proxy|reprint|custom|candidate|worthy|you\s+pick)\b/i;

export function titleLooksExcluded(title: string): boolean {
  return TITLE_EXCLUDE.test(title);
}

export function gradesMatch(
  cardGrade: string | undefined,
  detailsGrader: string | null | undefined,
  detailsGrade: string | null | undefined,
): boolean {
  const parsed = parseGrade(cardGrade ?? "");
  if (!parsed.company) return true;
  if (parsed.company === RAW_GRADE) {
    // Raw cards: keep listings that are not professionally graded.
    return !detailsGrader && !detailsGrade;
  }
  if (!detailsGrader || detailsGrade == null || detailsGrade === "") return false;
  return (
    detailsGrader.trim().toLowerCase() === parsed.company.toLowerCase() &&
    detailsGrade.trim().toLowerCase() === parsed.number.toLowerCase()
  );
}

function normalizeSoldAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString();
}

/**
 * Expand one Trawl sold result into zero or more cleaned sales.
 * Always expects details=1 fields when present.
 */
export function cleanTrawlResult(
  result: TrawlSoldResult,
  cardGrade?: string,
): CleanedSale[] {
  const details = result.details ?? null;

  if (details?.listing_state === "removed") return [];
  if (titleLooksExcluded(result.title)) return [];

  const grader = details?.grading?.grader ?? null;
  const grade = details?.grading?.grade ?? null;
  if (!gradesMatch(cardGrade, grader, grade)) return [];

  const url = result.item_link || details?.item_link || "";
  const currency = result.currency ?? null;

  const sales = details?.sales;
  if (Array.isArray(sales) && sales.length > 0) {
    const bestOfferPrice =
      details?.best_offer_accepted && typeof details.sale_price === "number"
        ? details.sale_price
        : null;

    return sales.map((sale) => ({
      itemId: result.item_id,
      title: result.title,
      price: bestOfferPrice ?? sale.sale_price,
      currency: sale.currency ?? currency,
      soldAt: normalizeSoldAt(sale.date_sold),
      grader,
      grade,
      url,
    }));
  }

  const price =
    details?.best_offer_accepted && typeof details.sale_price === "number"
      ? details.sale_price
      : result.sale_price;

  return [
    {
      itemId: result.item_id,
      title: result.title,
      price,
      currency,
      soldAt: normalizeSoldAt(result.date_sold),
      grader,
      grade,
      url,
    },
  ];
}

export function cleanTrawlResults(
  results: TrawlSoldResult[],
  cardGrade?: string,
): CleanedSale[] {
  return results.flatMap((result) => cleanTrawlResult(result, cardGrade));
}
