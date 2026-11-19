import { lastSale, type SoldsState } from "./comp";
import type { ScanMatch } from "./match";
import { REVEAL_LAND_MS } from "./reveal";

/**
 * Hit reveals (components/scan/hit-reveal.tsx): a scanned card that is a big hit gets its own
 * effect in place of the reveal's last sweep. Only from what the card and its sales really say:
 * a read serial, an autograph the card names, a matched recent sale. Nothing here is guessed.
 */

export type HitEffect = "shatter" | "storm" | "pixel";
/** 1: a quick version. 2: bigger. 3: the full show (a 1/1). */
export type HitStrength = 1 | 2 | 3;
export type HitReason = "one-of-one" | "low-serial" | "serial" | "patch-auto" | "auto" | "sale";
export type Hit = { effect: HitEffect; strength: HitStrength; reasons: HitReason[] };

/** A matched recent sale at or over this is a hit. */
export const HIT_SALE_CENTS = 100_00;
/** A card numbered to this or lower is a hit. */
export const HIT_SERIAL_RUN = 25;
/** ...and to this or lower, it gets the crystal. */
export const HIT_CRYSTAL_RUN = 10;

/**
 * The card's own newest recent sale, in cents. Null while the sales are still loading, when there
 * are none, when they are too far apart to trust, or when the card's version is still open (the
 * sales could be another version's).
 */
export function matchedSaleCents(match: ScanMatch, solds: SoldsState | null | undefined): number | null {
  if (!match.parallel || solds?.status !== "done") return null;
  return lastSale(solds.comp)?.priceCents ?? null;
}

/**
 * Is this scan a hit, which effect does it get, and how strong.
 * - Crystal Shatter: a 1/1 (the full show) or a card numbered /10 or lower.
 * - Storm Strike: an auto or a patch auto. Bigger when it is also numbered /25 or lower, a patch
 *   auto, or sold for $100 or more.
 * - Pixel Rebuild: numbered /25 or lower, or a matched recent sale of $100 or more. Bigger with both.
 * Anything else is not a hit and gets the normal reveal.
 */
export function hitFor(match: ScanMatch | null | undefined, solds?: SoldsState | null): Hit | null {
  if (!match) return null;
  const run = match.serialRun != null && match.serialRun > 0 ? match.serialRun : null;
  const sale = matchedSaleCents(match, solds);
  const numbered = run != null && run <= HIT_SERIAL_RUN;
  const bigSale = sale != null && sale >= HIT_SALE_CENTS;
  const reasons: HitReason[] = [];
  if (run === 1) reasons.push("one-of-one");
  else if (run != null && run <= HIT_CRYSTAL_RUN) reasons.push("low-serial");
  else if (numbered) reasons.push("serial");
  if (match.isAuto) reasons.push(match.isRelic ? "patch-auto" : "auto");
  if (bigSale) reasons.push("sale");
  if (reasons.length === 0) return null;

  if (run === 1) return { effect: "shatter", strength: 3, reasons };
  if (run != null && run <= HIT_CRYSTAL_RUN) return { effect: "shatter", strength: 2, reasons };
  if (match.isAuto) return { effect: "storm", strength: numbered || bigSale || match.isRelic ? 2 : 1, reasons };
  return { effect: "pixel", strength: numbered && bigSale ? 2 : 1, reasons };
}

/** The haptic on the hit moment. Bigger hits buzz stronger; a 1/1 ends on a success buzz. */
export type HitHaptic = "hit" | "hitBig" | "hitFull";

export type HitPlan = {
  /** The whole effect, before the card glides to its slot. */
  durationMs: number;
  /** The hit moment: the crystal bursts, the bolt lands, the pixels snap in. */
  impactMs: number;
  shakeMs: number;
  /** How far the stage shakes at its hardest. */
  shakePx: number;
  impactHaptic: HitHaptic;
  /** The build-up before the hit: the first crack, the rumble, the ticks as the pixels assemble. */
  buildHaptics: { atMs: number; moment: "lock" | "sweep" | "tick" }[];
  /** The first hit this collector ever scanned: the full-length show with a double ring. */
  first: boolean;
};

export const HIT_SHAKE_MS = 250;
/** Every hit but a 1/1 (and the one-time first hit) lands inside the normal reveal's ~1.6s. */
export const HIT_BUDGET_MS = 1600;
export const HIT_FULL_BUDGET_MS = 2500;

const DURATION_MS: Record<HitStrength, number> = { 1: 800, 2: 950, 3: 1850 };
/** The rarer the card, the longer the build before the hit. */
const IMPACT_MS: Record<HitStrength, number> = { 1: 500, 2: 620, 3: 1300 };
const SHAKE_PX: Record<HitStrength, number> = { 1: 4, 2: 6, 3: 8 };
const IMPACT_HAPTIC: Record<HitStrength, HitHaptic> = { 1: "hit", 2: "hitBig", 3: "hitFull" };

/** The effect's clock. `first`: this collector's first hit ever, which runs at a 1/1's length. */
export function hitPlan(hit: Hit, options: { first?: boolean } = {}): HitPlan {
  const first = Boolean(options.first);
  const length: HitStrength = first ? 3 : hit.strength;
  const durationMs = DURATION_MS[length];
  const impactMs = IMPACT_MS[length];
  const buildHaptics: HitPlan["buildHaptics"] = [];
  if (hit.effect === "shatter") buildHaptics.push({ atMs: Math.round(impactMs * 0.12), moment: "lock" });
  if (hit.effect === "storm") buildHaptics.push({ atMs: Math.round(impactMs * 0.1), moment: "sweep" });
  if (hit.effect === "pixel") {
    // Ticks as the card assembles, slowing down just before it snaps in.
    for (let at = 60, gap = 70; at < impactMs - 60; at += gap, gap = Math.round(gap * 1.18)) buildHaptics.push({ atMs: at, moment: "tick" });
  }
  return { durationMs, impactMs, shakeMs: HIT_SHAKE_MS, shakePx: SHAKE_PX[hit.strength], impactHaptic: IMPACT_HAPTIC[hit.strength], buildHaptics, first };
}

/** From the match coming in to the card locked in its slot. */
export function hitTotalMs(plan: HitPlan): number {
  return plan.durationMs + REVEAL_LAND_MS;
}

/**
 * The stage's shake, `ms` after the hit: quick and tight, at most `px` either way, gone by
 * HIT_SHAKE_MS. The same every time, so the shake and the buzz always line up.
 */
export function shakeOffset(ms: number, px: number): { x: number; y: number } {
  if (ms < 0 || ms >= HIT_SHAKE_MS || px <= 0) return { x: 0, y: 0 };
  const decay = (1 - ms / HIT_SHAKE_MS) ** 2;
  const round = (value: number) => Math.round(value * 100) / 100;
  return { x: round(px * decay * Math.cos(ms * 0.105)), y: round(px * 0.7 * decay * Math.sin(ms * 0.142 + 0.6)) };
}

/**
 * Hits scanned back-to-back. `count`: the streak now. `before`: the streak before the last scan,
 * kept so a sale that lands after the scan (and makes it a hit) can count it.
 */
export type HitStreak = { count: number; before: number };

export const NO_STREAK: HitStreak = { count: 0, before: 0 };

/** One more scan: a hit adds to the streak, anything else ends it. */
export function streakAfterScan(streak: HitStreak, isHit: boolean): HitStreak {
  return { count: isHit ? streak.count + 1 : 0, before: streak.count };
}

/** The last scan turned out to be a hit after all (its sale came in late). */
export function streakWithLateHit(streak: HitStreak): HitStreak {
  return { count: streak.before + 1, before: streak.before };
}

/** The counter shows from the second hit in a row. Real counts only. */
export function streakShown(streak: HitStreak): number | null {
  return streak.count >= 2 ? streak.count : null;
}

export const HIT_COPY = {
  streak: "Hit streak",
  share: "Share this hit",
  saveClip: "Save clip",
  saving: "Saving your clip",
  saved: "Clip saved",
  shareFailed: "Couldn't save the clip, try again",
  replay: "Replay",
  replayCard: "Replay the hit",
  close: "Close",
  first: "Your first hit",
  setting: "Hit reveals",
  settingHelp: "A short effect when you scan a big hit, like a 1/1, a low serial or an auto.",
  effect: { shatter: "Crystal Shatter", storm: "Storm Strike", pixel: "Pixel Rebuild" },
} as const;

/** Why this card is a hit, as the result sheet says it: "1/1", "/10", "Patch auto", "Sold for $100+". */
export function hitLabel(hit: Hit, match: ScanMatch): string {
  const reason = hit.reasons[0];
  if (reason === "one-of-one") return "1/1";
  if (reason === "low-serial" || reason === "serial") return `Numbered /${match.serialRun}`;
  if (reason === "patch-auto") return "Patch auto";
  if (reason === "auto") return "Auto";
  return "Sold for $100 or more";
}
