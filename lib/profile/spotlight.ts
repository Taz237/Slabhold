/**
 * The profile Spotlight carousel's math, with no DOM and no React, so every
 * rule is unit-tested: how a card looks from its distance to center, the
 * order of the row, which cards hold real DOM, when a snap ticks, and the
 * colour of the glow. The component is components/profile/spotlight-carousel.tsx.
 */
import { amountFromStoredCompValue } from "@/lib/comps/shared-value";
import { slabLabel } from "@/lib/collection/grid";
import type { PublicCard } from "@/lib/social/types";
import type { PriceRead } from "@/lib/value/price-fallback";
import type { CardValueResult } from "@/lib/value/types";

/** The centered card is 1 / 0 / 0. A card at the clamp distance or past it is these. */
export const SPOT_MIN_SCALE = 0.78;
/** The dark veil over a far card: brightness 1 down to about 0.55. */
export const SPOT_MAX_DIM = 0.45;
export const SPOT_MAX_BLUR_PX = 3;

/** Cards this far each side of center hold their real art and photo. */
export const SPOT_WINDOW = 3;
/** Cards this far each side of center get their own layer (will-change). */
export const SPOT_LAYERS = 2;
/** At most one haptic tick per this many ms, however fast the row spins. */
export const SPOT_TICK_GAP_MS = 80;

function clamp01(value: number): number {
  if (!(value > 0)) return 0;
  return value > 1 ? 1 : value;
}

/** Quad ease-out: quick to leave the center, soft into the clamp. The CSS keyframes use the same curve. */
export function spotEase(t: number): number {
  const x = clamp01(t);
  return 1 - (1 - x) * (1 - x);
}

/**
 * The distance where a card is fully "off": half the row plus half a card,
 * about 1.3 to 1.7 card widths. It is where a card's edge leaves the row,
 * which is also the end of the CSS `view()` timeline, so the scroll-driven
 * engine and the JS fallback draw the same thing.
 */
export function spotClamp(rowWidth: number, cardWidth: number): number {
  return Math.max(1, (rowWidth + cardWidth) / 2);
}

/** 0 at center, 1 at the clamp or past it. One smooth curve, never steps. */
export function spotAmount(distancePx: number, clampPx: number): number {
  if (!(clampPx > 0)) return 0;
  return spotEase(Math.abs(distancePx) / clampPx);
}

export type SpotStyle = { scale: number; dim: number; blurPx: number };

/** What a card looks like at this distance from the center of the row. */
export function spotStyle(distancePx: number, clampPx: number): SpotStyle {
  const amount = spotAmount(distancePx, clampPx);
  return {
    scale: 1 - (1 - SPOT_MIN_SCALE) * amount,
    dim: SPOT_MAX_DIM * amount,
    blurPx: SPOT_MAX_BLUR_PX * amount,
  };
}

/** Which card is nearest the center for this scroll position. */
export function centeredIndex(scrollLeft: number, pitchPx: number, count: number): number {
  if (count <= 0 || !(pitchPx > 0)) return 0;
  const index = Math.round(scrollLeft / pitchPx);
  return Math.min(count - 1, Math.max(0, index));
}

/** First and last index (inclusive) that hold real DOM around `center`. */
export function mountedWindow(center: number, count: number, radius = SPOT_WINDOW): [number, number] {
  if (count <= 0) return [0, -1];
  const mid = Math.min(count - 1, Math.max(0, center));
  return [Math.max(0, mid - radius), Math.min(count - 1, mid + radius)];
}

/**
 * Whether the mounted window should move to follow the centered card. It
 * moves every second card, not every card, so a hard spin does half the DOM
 * work. The centered card and both neighbours (all that can be on screen)
 * are always inside the window before and after a move.
 */
export function windowShouldMove(center: number, windowCenter: number): boolean {
  return Math.abs(center - windowCenter) >= 2;
}

type SortCard = Pick<PublicCard, "id" | "estimatedSellPrice" | "createdAt">;

function sortAmount(card: SortCard, values: ReadonlyMap<string, CardValueResult>): number | null {
  const stored = amountFromStoredCompValue(values.get(card.id));
  if (stored != null && stored > 0) return stored;
  return card.estimatedSellPrice > 0 ? card.estimatedSellPrice : null;
}

function newestFirst(a: SortCard, b: SortCard): number {
  const byDate = (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
}

/**
 * The row's order: highest value first, then newest, the same as
 * /u/<handle>/collection. A card with no value yet goes last, newest first.
 */
export function sortSpotlightCards<T extends SortCard>(
  cards: readonly T[],
  values: ReadonlyMap<string, CardValueResult>,
): T[] {
  return [...cards].sort((a, b) => {
    const left = sortAmount(a, values);
    const right = sortAmount(b, values);
    if (left == null && right == null) return newestFirst(a, b);
    if (left == null) return 1;
    if (right == null) return -1;
    return right - left || newestFirst(a, b);
  });
}

/**
 * What the row holds. Every public card is in it (no cap). With 2 or more,
 * one "See all N" tile sits at the very end and opens the full grid.
 */
export function spotlightRow(cardCount: number): { slides: number; seeAll: boolean; seeAllCount: number } {
  const count = Math.max(0, Math.floor(cardCount));
  const seeAll = count >= 2;
  return { slides: count + (seeAll ? 1 : 0), seeAll, seeAllCount: count };
}

/**
 * Decides when a snap ticks. A tick is for a new card reaching the center
 * while the reader's own swipe (or its momentum) moves the row: never the
 * first position, never a scroll the code started, and never two ticks
 * closer than SPOT_TICK_GAP_MS.
 */
export function createTickGate(minGapMs = SPOT_TICK_GAP_MS) {
  let last: number | null = null;
  let lastTickAt = -Infinity;
  return function shouldTick(index: number, nowMs: number, fromUser: boolean): boolean {
    const changed = last !== null && index !== last;
    last = index;
    if (!changed || !fromUser) return false;
    if (nowMs - lastTickAt < minGapMs) return false;
    lastTickAt = nowMs;
    return true;
  };
}

/** Brand purple #7C3AED as hue, saturation, lightness. */
const BRAND_HUE = 262;
const BRAND_SAT = 83;
const BRAND_LIGHT = 58;
/** The glow leans at most this far toward the card's colour, so it always reads purple. */
const MAX_HUE_LEAN = 30;
const HUE_LEAN_STRENGTH = 0.35;

function hexHsl(hex: string): { h: number; s: number; l: number } | null {
  const raw = hex.trim().replace(/^#/, "");
  const full = raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}

/**
 * The hue of the glow behind this card. It starts at brand purple and leans
 * a little toward the card's own colour: bluer for a blue, green or teal
 * card, pinker for a red or orange one. The lean is capped at 30 degrees, so
 * the result stays between 232 and 292 and can never land in teal (160-200).
 * A grey card, or no colour, is plain brand purple.
 */
export function glowHue(accent: string | null | undefined): number {
  const color = hexHsl(accent ?? "");
  if (!color || color.s < 0.12) return BRAND_HUE;
  // Shortest way round the wheel from purple to the card's hue: -180..180.
  const arc = ((color.h - BRAND_HUE + 540) % 360) - 180;
  const lean = Math.max(-MAX_HUE_LEAN, Math.min(MAX_HUE_LEAN, arc * HUE_LEAN_STRENGTH * Math.min(1, color.s * 1.5)));
  return Math.round(BRAND_HUE + lean);
}

/** The glow colour as CSS, e.g. "hsl(262 83% 58%)". */
export function glowTint(accent: string | null | undefined): string {
  return `hsl(${glowHue(accent)} ${BRAND_SAT}% ${BRAND_LIGHT}%)`;
}

export type SpotLabel = {
  title: string;
  /** "2018 · Prizm · Silver · PSA 10" */
  line: string;
  /** A real value only: "Est. $412.00". Null for no value, $0 or a status. */
  price: string | null;
  openToOffers: boolean;
};

type LabelCard = Pick<PublicCard, "playerName" | "year" | "yearLabel" | "setBrand" | "parallel" | "grade" | "conditionType" | "grader" | "openToOffers">;

function realPrice(read: PriceRead | null | undefined): string | null {
  if (!read) return null;
  if (read.kind !== "estimate" && read.kind !== "last_sale" && read.kind !== "range") return null;
  const text = read.text.trim();
  if (!/\d/.test(text) || /NaN|Infinity/.test(text)) return null;
  // "$0", "$0.00": never a fake number.
  if (/^[^\d-]*0(?:\.0+)?$/.test(text)) return null;
  return read.kind === "estimate" ? `Est. ${text}` : text;
}

/** The words on the centered card's label. */
export function spotLabel(card: LabelCard, read?: PriceRead | null): SpotLabel {
  const year = (card.yearLabel ?? "").trim() || (card.year > 0 ? String(card.year) : "");
  const line = [year, card.setBrand.trim(), (card.parallel ?? "").trim(), slabLabel(card)]
    .filter(Boolean)
    .join(" · ");
  return {
    title: card.playerName,
    line,
    price: realPrice(read),
    openToOffers: card.openToOffers === true,
  };
}
