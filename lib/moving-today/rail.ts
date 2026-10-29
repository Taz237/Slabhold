import type { TileCard } from "@/components/card-tile";
import type { TileGain } from "@/lib/collection/grid";
import { splitMovers } from "./rank";
import type { MovingTodayPayload, MovingTodaySale } from "./types";

/** Tiles in the Home rail. The rest are behind "See all". */
export const MOVING_RAIL_COUNT = 12;

/** "LIVE" only for a day list read in the last hour. */
export const MOVING_LIVE_MINUTES = 60;

export type MoverDirection = "up" | "down";

/** The percent chip, in the GainChip look. Null for a sale with no real percent. */
export function moverGain(sale: Pick<MovingTodaySale, "percent" | "percentLabel">): TileGain | null {
  if (sale.percent == null || sale.percent === 0 || !sale.percentLabel) return null;
  return { tone: sale.percent > 0 ? "up" : "down", pctText: sale.percentLabel };
}

/** "Up 115%" or "Down 40%" over the top mover. */
export function moveBadgeText(percent: number | null): string {
  if (percent == null || percent === 0 || !Number.isFinite(percent)) return "";
  return `${percent > 0 ? "Up" : "Down"} ${Math.abs(Math.round(percent))}%`;
}

const MONTH_DAY = /^([A-Z][a-z]{2}) (\d{1,2})$/;

/** "Oct 23 – Oct 29" reads as "Oct 23–29" in the one-line rail header. */
export function compactRangeLabel(dateLabel: string): string {
  const [start, end] = dateLabel.split(" – ");
  if (!end) return dateLabel;
  const a = MONTH_DAY.exec(start ?? "");
  const b = MONTH_DAY.exec(end);
  if (a && b && a[1] === b[1]) return `${a[1]} ${a[2]}–${b[2]}`;
  return dateLabel;
}

let clockFormat: Intl.DateTimeFormat | null = null;

/**
 * Freshness from the real read time. Relative under an hour, the clock time
 * after. LIVE only for the day window under an hour old. Null with no time.
 */
export function moverFreshness(
  updatedAt: string | undefined,
  window: MovingTodayPayload["window"],
  now: number,
): { live: boolean; label: string } | null {
  const then = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  if (!Number.isFinite(then)) return null;
  const minutes = Math.floor(Math.max(0, now - then) / 60_000);
  const live = window === "day" && minutes < MOVING_LIVE_MINUTES;
  if (minutes < 1) return { live, label: "Updated just now" };
  if (minutes < 60) return { live, label: `Updated ${minutes}m ago` };
  clockFormat ??= new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
  return { live, label: `Updated ${clockFormat.format(new Date(then))}` };
}

export function parseDirection(value: unknown): MoverDirection | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "up" || raw === "down" ? raw : null;
}

/** Whichever side has more cards. Up on a tie. */
export function defaultDirection(sales: readonly Pick<MovingTodaySale, "percent">[]): MoverDirection {
  const { up, down } = splitMovers(sales);
  return down.length > up.length ? "down" : "up";
}

/** A rounded step of the chip count-up: "+115%" at 0.5 reads "+58%". */
export function countUpText(pctText: string, progress: number): string {
  const match = /^([+−-]?)(\d+)%$/.exec(pctText);
  if (!match) return pctText;
  const t = Math.min(1, Math.max(0, progress));
  if (t >= 1) return pctText;
  const value = Math.round(Number(match[2]) * t);
  return value === 0 ? "0%" : `${match[1]}${value}%`;
}

/** The shared tile's card fields for a mover. */
export function moverTileCard(sale: MovingTodaySale): TileCard {
  return {
    id: sale.cardId,
    playerName: sale.player,
    year: 0,
    yearLabel: sale.yearLabel,
    setBrand: sale.setBrand,
    accent: sale.accent,
    photoDataUrl: sale.imageUrl,
    grade: sale.grade,
    grader: sale.grader,
    conditionType: sale.conditionType ?? undefined,
    isRookie: sale.isRookie,
  };
}

/** "Victor Wembanyama, 2023-24 · Prizm, PSA 10, sold for $200.00, up 40% versus recent comps" */
export function moverAccessibleName(sale: MovingTodaySale): string {
  const move = moveBadgeText(sale.percent).toLowerCase();
  return [
    sale.player,
    [sale.yearLabel, sale.setBrand].map((part) => part.trim()).filter(Boolean).join(" · "),
    sale.grade,
    `sold for ${sale.priceLabel}`,
    move ? `${move} versus recent comps` : "",
  ]
    .filter(Boolean)
    .join(", ");
}
