import {
  gradeNumberFromGrade,
  gradingCompanyFromCard,
  isRawGradingCompany,
} from "@/lib/cards/grading-company";
import { amountFromStoredCompValue } from "@/lib/comps/shared-value";
import { cardTitle, hasPaid, isSold, pct, signedMoney } from "@/lib/format";
import { cardProfit, cardProfitPct } from "@/lib/portfolio";
import type { SportsCard } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";

type GradeFields = {
  grade?: string | null;
  conditionType?: SportsCard["conditionType"] | null;
  grader?: string | null;
};

export type TileKind = "slab" | "card";

/** Graded cards sit in a slab. Raw cards are just the card. */
export function tileKind(card: GradeFields): TileKind {
  if (card.conditionType === "raw") return "card";
  if (card.conditionType === "graded") return "slab";
  const company = gradingCompanyFromCard(card);
  return company && !isRawGradingCompany(company) ? "slab" : "card";
}

function slabParts(card: GradeFields): { company: string; number: string } {
  if (tileKind(card) !== "slab") return { company: "", number: "" };
  const company = gradingCompanyFromCard(card);
  return {
    company: company && !isRawGradingCompany(company) ? company : "",
    number: gradeNumberFromGrade(card.grade ?? ""),
  };
}

/** "PSA 10", "BGS 9.5". Empty for raw cards. */
export function slabLabel(card: GradeFields): string {
  const { company, number } = slabParts(card);
  return [company, number].filter(Boolean).join(" ");
}

export function slabCompany(card: GradeFields): string {
  return slabParts(card).company;
}

export function slabNumber(card: GradeFields): string {
  return slabParts(card).number;
}

export type SlabTone = "psa" | "bgs" | "sgc" | "cgc" | "neutral";

/** Flat label colors by grader. Text only, no logos. */
export function slabTone(card: GradeFields): SlabTone {
  const company = slabParts(card).company.toUpperCase();
  if (company === "PSA") return "psa";
  if (company === "BGS") return "bgs";
  if (company === "SGC") return "sgc";
  if (company === "CGC") return "cgc";
  return "neutral";
}

/** 2 columns at 390px, 3 at sm, 4 at lg, 12px gaps. */
export const GRID_CLASS = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4";

export const TILE_IMAGE_SIZES =
  "(min-width: 1024px) 22vw, (min-width: 640px) 30vw, 46vw";

/** The first row or two is above the fold on a phone. */
export const EAGER_TILES = 4;

export function tileLoading(index: number): "eager" | "lazy" {
  return index < EAGER_TILES ? "eager" : "lazy";
}

/** One ghost "Add a card" tile keeps a thin grid looking intentional. */
export function showGhostTile(count: number): boolean {
  return count >= 1 && count <= 3;
}

/** Must match images.remotePatterns in next.config.ts. */
export const CARD_PHOTO_ORIGIN = "https://knuwflptobyutrauxblj.supabase.co";
/** The bucket card photos upload to (uploadMedia "card-photos"). */
export const CARD_PHOTO_PATH = "/storage/v1/object/public/card-photos/";

export type PhotoSource =
  | { kind: "none" }
  | { kind: "optimized"; src: string }
  | { kind: "plain"; src: string };

/** next/image only for card photos. Avatars, other buckets and data URLs stay a plain img. */
export function photoSource(url: string | null | undefined): PhotoSource {
  const src = (url ?? "").trim();
  if (!src) return { kind: "none" };
  if (src.startsWith(`${CARD_PHOTO_ORIGIN}${CARD_PHOTO_PATH}`) && !src.includes("?")) {
    return { kind: "optimized", src };
  }
  return { kind: "plain", src };
}

export type PhotoStatus = "loading" | "loaded" | "error";

export function photoStatusAfter(
  status: PhotoStatus,
  event: "load" | "error" | "reset",
): PhotoStatus {
  if (event === "reset") return "loading";
  if (event === "error") return "error";
  return status === "error" ? "error" : "loaded";
}

/** The full placeholder replaces the photo when there is none or it failed. */
export function showPhotoPlaceholder(source: PhotoSource, status: PhotoStatus): boolean {
  return source.kind === "none" || status === "error";
}

export function yearSetLine(
  card: Pick<SportsCard, "year" | "setBrand"> & { yearLabel?: string },
): string {
  const year = (card.yearLabel ?? "").trim() || (card.year > 0 ? String(card.year) : "");
  return [year, card.setBrand.trim()].filter(Boolean).join(" · ");
}

export type TileGain = {
  tone: "up" | "down";
  /** Left out for a percent-only move, like a mover's change versus recent comps. */
  amount?: number;
  amountText?: string;
  pctText: string;
};

/**
 * Gain or loss for a tile. Needs a price paid and a value: a sold price,
 * or a market estimate (not a range, last sale or similar card).
 */
export function tileGain(
  card: SportsCard,
  values: Map<string, CardValueResult>,
  opts: { valuePending: boolean; estimate: boolean },
): TileGain | null {
  if (opts.valuePending || !hasPaid(card)) return null;
  if (!isSold(card) && !opts.estimate) return null;
  const amount = cardProfit(card, values);
  const ratio = cardProfitPct(card, values);
  if (amount == null || ratio == null) return null;
  return {
    tone: amount >= 0 ? "up" : "down",
    amount,
    amountText: signedMoney(amount),
    pctText: pct(ratio),
  };
}

export const NO_VALUE_LABEL = "No value yet";

/**
 * What a tile shows in its price slot. A missing, $0 or NaN price reads "No
 * value yet", muted, so the slot is never blank and never a fake number.
 */
export function tilePriceSlot(label: string | null | undefined): { text: string; muted: boolean } {
  const text = typeof label === "string" ? label.trim() : "";
  if (!text || /NaN|Infinity/.test(text) || /^[^\d-]*0(?:\.0+)?$/.test(text)) {
    return { text: NO_VALUE_LABEL, muted: true };
  }
  return { text, muted: false };
}

/** "Luka Dončić 2018 Prizm, PSA 10, $412.00" */
export function tileAccessibleName(
  card: GradeFields &
    Pick<SportsCard, "playerName" | "year" | "setBrand"> & { yearLabel?: string },
  valueText: string | null,
): string {
  const grade = slabLabel(card) || (tileKind(card) === "slab" ? "Graded" : "Raw");
  return [`${card.playerName} ${cardTitle(card)}`.trim(), grade, valueText]
    .filter(Boolean)
    .join(", ");
}

export type GridSort = "value" | "recent" | "gain";

export const GRID_SORTS: { id: GridSort; label: string }[] = [
  { id: "value", label: "Value" },
  { id: "recent", label: "Recently added" },
  { id: "gain", label: "Gain" },
];

function tileAmount(card: SportsCard, values: Map<string, CardValueResult>): number | null {
  if (isSold(card)) return card.sellPrice;
  return amountFromStoredCompValue(values.get(card.id));
}

function newestFirst(a: SportsCard, b: SportsCard): number {
  const byDate = b.createdAt.localeCompare(a.createdAt);
  return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
}

/** Highest first. Cards without a number go last, newest first. */
export function sortGridCards(
  cards: SportsCard[],
  sort: GridSort,
  values: Map<string, CardValueResult>,
): SportsCard[] {
  if (sort === "recent") return [...cards].sort(newestFirst);
  const metric =
    sort === "gain"
      ? (card: SportsCard) => cardProfit(card, values)
      : (card: SportsCard) => tileAmount(card, values);
  return [...cards].sort((a, b) => {
    const left = metric(a);
    const right = metric(b);
    if (left == null && right == null) return newestFirst(a, b);
    if (left == null) return 1;
    if (right == null) return -1;
    return right - left || newestFirst(a, b);
  });
}
