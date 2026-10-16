import { parseGrade, RAW_GRADE } from "@/lib/card-options";
import { filterPriceOutliers } from "./stats";
import type { CleanedSale, TrawlSoldResult } from "./types";

/** Whole-word title exclusions (case-insensitive). */
const TITLE_EXCLUDE =
  /\b(?:lot|lots|auto|autograph|autographed|proxy|reprint|custom|candidate|worthy|you\s+pick|RP)\b/i;

/** Competing product lines — reject when not part of the card's own set. */
const SET_KEYWORDS = [
  "select",
  "mosaic",
  "optic",
  "donruss",
  "contenders",
  "national treasures",
  "immaculate",
  "flawless",
  "chronicles",
  "spectra",
  "absolute",
  "phoenix",
  "obsidian",
  "revolution",
  "hoops",
  "court kings",
  "monopoly",
  "prizm",
  "bowman",
  "topps chrome",
  "topps now",
  "topps",
  "upper deck",
  "fleer",
  "skybox",
  "score",
  "leaf",
] as const;

/** Parallel / color / serial cues — reject unless they match the card's parallel. */
const PARALLEL_KEYWORDS = [
  "silver",
  "holo",
  "refractor",
  "gold",
  "green",
  "blue",
  "red",
  "pink",
  "purple",
  "orange",
  "black",
  "white",
  "cracked ice",
  "wave",
  "scope",
  "shimmer",
  "mojo",
  "camo",
  "tie-dye",
  "disco",
] as const;

const SERIAL_RE = /\/\d+\b/;
const TITLE_GRADE_RE =
  /\b(PSA|BGS|SGC|CGC|TAG|HGA)\s*(\d+(?:\.\d+)?)\b/i;
/** Professional grade cues in title or grading details (raw cards must exclude). */
const GRADED_CUE_RE =
  /\b(?:PSA|BGS|SGC|CGC|TAG|HGA|graded)\b|\bGem\s*Mint\b/i;
/** #token in titles — set codes like #AS22 / #OS3 must match exactly. */
const TITLE_HASH_NUMBER_RE = /#([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)/g;

export type CleanCardFilter = {
  grade?: string;
  cardNumber?: string;
  setBrand?: string;
  parallel?: string;
};

export function isLowConfidence(count: number): boolean {
  return count < 5;
}

export function titleLooksExcluded(title: string): boolean {
  return TITLE_EXCLUDE.test(title);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Normalize a card number for exact comparison (#196 → 196). */
export function normalizeCardNumber(value: string | undefined | null): string {
  return (value ?? "").replace(/^#/, "").trim().toUpperCase();
}

/** All #tokens in a title (e.g. #AS22, #196). */
export function titleHashCardNumbers(title: string): string[] {
  const out: string[] = [];
  TITLE_HASH_NUMBER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TITLE_HASH_NUMBER_RE.exec(title)) !== null) {
    out.push(match[1].toUpperCase());
  }
  return out;
}

/**
 * Card number must match exactly from a title #token when present.
 * A different set code (#AS22 or #OS3 vs #196) does not match.
 * If the title has no #token, fall back to a bare whole-token match.
 */
export function titleHasCardNumber(title: string, cardNumber?: string): boolean {
  const num = normalizeCardNumber(cardNumber);
  if (!num) return true;

  const hashTokens = titleHashCardNumbers(title);
  if (hashTokens.length > 0) {
    return hashTokens.some((token) => token === num);
  }

  const escaped = escapeRegExp(num);
  const re = new RegExp(`(?<![\\w#])${escaped}\\b`, "i");
  return re.test(title);
}

export function isRawCardGrade(cardGrade: string | undefined): boolean {
  const parsed = parseGrade(cardGrade ?? "");
  return parsed.company === RAW_GRADE;
}

function normalizeSetToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bpanini\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distinctive set phrase the title must include (e.g. "prizm" from "Panini Prizm"). */
export function setMatchPhrase(setBrand?: string): string {
  const raw = (setBrand ?? "").trim();
  if (!raw) return "";
  const withoutPanini = normalizeSetToken(raw);
  return withoutPanini || raw.toLowerCase();
}

export function titleHasSetName(title: string, setBrand?: string): boolean {
  const phrase = setMatchPhrase(setBrand);
  if (!phrase) return true;
  const re = new RegExp(`\\b${escapeRegExp(phrase).replace(/\s+/g, "\\s+")}\\b`, "i");
  return re.test(title);
}

export function titleNamesWrongSet(title: string, setBrand?: string): boolean {
  const cardSet = normalizeSetToken(setBrand ?? "");
  const lower = title.toLowerCase();
  for (const keyword of SET_KEYWORDS) {
    if (cardSet.includes(keyword)) continue;
    const re = new RegExp(`\\b${escapeRegExp(keyword).replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(lower)) return true;
  }
  return false;
}

function parallelIsBase(parallel?: string): boolean {
  const p = (parallel ?? "").trim().toLowerCase();
  return !p || p === "base";
}

export function titleHasDisallowedParallel(
  title: string,
  parallel?: string,
): boolean {
  const lower = title.toLowerCase();
  const allowed = (parallel ?? "").trim().toLowerCase();
  const base = parallelIsBase(parallel);

  if (SERIAL_RE.test(title)) {
    // Allow "/99"-style only when the card's parallel is that serial (e.g. "/99").
    if (base || !allowed.includes("/")) return true;
    if (!lower.includes(allowed)) return true;
  }

  for (const keyword of PARALLEL_KEYWORDS) {
    const re = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i");
    if (!re.test(lower)) continue;
    if (base) return true;
    if (allowed !== keyword && !allowed.includes(keyword)) return true;
  }
  return false;
}

export function parseGradeFromTitle(
  title: string,
): { grader: string; grade: string } | null {
  const match = title.match(TITLE_GRADE_RE);
  if (!match) return null;
  return { grader: match[1].toUpperCase(), grade: match[2] };
}

function gradingDetailsCueText(result: TrawlSoldResult): string {
  const details = result.details?.grading;
  if (!details) return "";
  return [details.grader, details.grade, details.condition]
    .filter((part) => part != null && String(part).trim() !== "")
    .join(" ");
}

/**
 * True when details or title indicate a professionally graded listing.
 * Used so RAW cards reject PSA/BGS/SGC/CGC/TAG/HGA / "graded" / "Gem Mint".
 */
export function listingLooksProfessionallyGraded(
  result: TrawlSoldResult,
): boolean {
  const details = result.details?.grading;
  if (details?.graded === true) return true;
  if (details?.grader?.trim()) return true;
  if (details?.grade != null && String(details.grade).trim() !== "") {
    return true;
  }
  if (GRADED_CUE_RE.test(result.title)) return true;
  if (GRADED_CUE_RE.test(gradingDetailsCueText(result))) return true;
  return false;
}

/**
 * Prefer Trawl grading details; otherwise parse grader + number from the title.
 * Ungraded listings return { grader: null, grade: null } (kept for RAW cards).
 */
export function resolveListingGrade(result: TrawlSoldResult): {
  grader: string | null;
  grade: string | null;
} {
  const details = result.details?.grading;
  const grader = details?.grader?.trim() || null;
  const grade =
    details?.grade != null && String(details.grade).trim() !== ""
      ? String(details.grade).trim()
      : null;

  if (grader && grade) {
    return { grader, grade };
  }

  const fromTitle = parseGradeFromTitle(result.title);
  if (fromTitle) return fromTitle;
  return { grader: null, grade: null };
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

export function titleMatchesCard(title: string, card?: CleanCardFilter): boolean {
  if (!card) return !titleLooksExcluded(title);
  if (titleLooksExcluded(title)) return false;
  if (!titleHasCardNumber(title, card.cardNumber)) return false;
  if (!titleHasSetName(title, card.setBrand)) return false;
  if (titleNamesWrongSet(title, card.setBrand)) return false;
  if (titleHasDisallowedParallel(title, card.parallel)) return false;
  return true;
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
  cardOrGrade?: CleanCardFilter | string,
): CleanedSale[] {
  const card: CleanCardFilter | undefined =
    typeof cardOrGrade === "string"
      ? { grade: cardOrGrade }
      : cardOrGrade;

  const details = result.details ?? null;

  if (details?.listing_state === "removed") return [];
  if (!titleMatchesCard(result.title, card)) return [];

  // RAW cards: exclude any professionally graded listing (details or title cues).
  if (isRawCardGrade(card?.grade) && listingLooksProfessionallyGraded(result)) {
    return [];
  }

  const resolved = resolveListingGrade(result);
  const { grader, grade } = resolved;

  // Graded cards require a resolvable grader + grade that matches exactly.
  if (!isRawCardGrade(card?.grade)) {
    if (!grader || grade == null || grade === "") return [];
  }

  if (!gradesMatch(card?.grade, grader, grade)) return [];

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
  cardOrGrade?: CleanCardFilter | string,
): CleanedSale[] {
  return results.flatMap((result) => cleanTrawlResult(result, cardOrGrade));
}

/** Dedupe by normalized title + price + sold date (calendar day). */
export function dedupeSales(sales: CleanedSale[]): CleanedSale[] {
  const seen = new Set<string>();
  const out: CleanedSale[] = [];
  for (const sale of sales) {
    const title = sale.title.toLowerCase().replace(/\s+/g, " ").trim();
    const day = sale.soldAt.slice(0, 10);
    const key = `${title}|${sale.price}|${day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sale);
  }
  return out;
}

/** Title/grade filters then dedupe + price-outlier rejection — the list stats are computed from. */
export function prepareSales(
  results: TrawlSoldResult[],
  card: CleanCardFilter,
): CleanedSale[] {
  return filterPriceOutliers(dedupeSales(cleanTrawlResults(results, card)));
}
