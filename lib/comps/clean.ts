import { parseGrade, RAW_GRADE } from "@/lib/card-options";
import type { CleanedSale, TrawlSoldResult } from "./types";

/** Whole-word title exclusions (case-insensitive). */
const TITLE_EXCLUDE =
  /\b(?:lot|lots|proxy|reprint|custom|candidate|worthy|you\s+pick|RP)\b/i;

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
const TITLE_GRADE_RE = /\b(PSA|BGS|SGC|CGC)\s*(\d+(?:\.\d+)?)\b/i;

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

/** Title must contain #N or N as its own token. */
export function titleHasCardNumber(title: string, cardNumber?: string): boolean {
  const num = (cardNumber ?? "").replace(/^#/, "").trim();
  if (!num) return true;
  const escaped = escapeRegExp(num);
  const re = new RegExp(`(?:#${escaped}\\b|(?<![\\w#])${escaped}\\b)`, "i");
  return re.test(title);
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

/**
 * Prefer Trawl grading details; otherwise parse PSA/BGS/SGC/CGC + number from the title.
 * Returns null when grade cannot be determined (caller should drop the comp).
 */
export function resolveListingGrade(result: TrawlSoldResult): {
  grader: string | null;
  grade: string | null;
} | null {
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
  return null;
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

  const resolved = resolveListingGrade(result);
  if (!resolved) return [];

  const { grader, grade } = resolved;
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
