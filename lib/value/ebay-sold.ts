import {
  canonicalParallelName,
  parallelMatchKey,
} from "@/lib/cards/parallels";
import { NOT_ENOUGH_SALES_LABEL } from "@/lib/value/format";

export const EBAY_SOLD_LINK_LABEL = "See eBay sold";

export type EbaySoldCard = {
  playerName?: string | null;
  year?: number | null;
  yearLabel?: string | null;
  setBrand?: string | null;
  parallel?: string | null;
  cardNumber?: string | null;
  grade?: string | null;
};

/**
 * Search text for an eBay sold listing.
 * Parallel words stay here so a later matcher can reuse the same card fields.
 */
export function ebaySoldSearchQuery(card: EbaySoldCard): string {
  const year = (card.yearLabel ?? "").trim() || (card.year ? String(card.year) : "");
  const parallel = canonicalParallelName(card.setBrand ?? "", card.parallel ?? "");
  const showParallel = Boolean(parallel) && parallelMatchKey(parallel) !== "base";
  const number = (card.cardNumber ?? "").trim().replace(/^#/, "");
  const grade = (card.grade ?? "").trim();
  const showGrade = Boolean(grade) && !/^raw$/i.test(grade);
  return [
    year,
    (card.setBrand ?? "").trim(),
    (card.playerName ?? "").replace(/\s+/g, " ").trim(),
    showParallel ? parallel : "",
    number && number !== "—" ? `#${number}` : "",
    showGrade ? grade : "",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** eBay sold and completed search. Null when there is nothing to search. */
export function ebaySoldSearchUrl(query: string): string | null {
  const text = query.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const url = new URL("https://www.ebay.com/sch/i.html");
  url.searchParams.set("_nkw", text);
  url.searchParams.set("LH_Sold", "1");
  url.searchParams.set("LH_Complete", "1");
  return url.toString();
}

export function ebaySoldSearchUrlForCard(card: EbaySoldCard): string | null {
  return ebaySoldSearchUrl(ebaySoldSearchQuery(card));
}

/**
 * Dollar amount or a short status ("Value updating", "…").
 * "Not enough sales yet" is not an estimate.
 */
export function attachmentPriceText(label: string | null | undefined): string | null {
  const text = label?.replace(/\s+/g, " ").trim() ?? "";
  if (!text || text === NOT_ENOUGH_SALES_LABEL) return null;
  return text;
}

/** The acquisition source "eBay" is not a link. Don't print it as plain text. */
export function visibleAcquiredSource(source: string | null | undefined): string | null {
  const text = source?.replace(/\s+/g, " ").trim() ?? "";
  if (!text || text.toLowerCase() === "ebay") return null;
  return text;
}
