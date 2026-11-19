import type { HitEffect, HitPlan } from "../hit";

/**
 * What the effect looks like at one moment, as plain numbers the renderer draws (engine.ts). Kept
 * apart from WebGL so the same clock drives the live reveal, the replay and the share clip.
 */
export type HitFrame = {
  /** Crystal: how far the cracks have spread from the center, 0 to 1. */
  crack: number;
  /** Crystal: how far the shards have flown, 0 (whole pane) to 1 (gone). */
  burst: number;
  /** Pixels: the assembly's clock, 0 (a cloud) to 1 (every pixel home). */
  assemble: number;
  /** Pixels: the squares fade as the real card takes over. */
  pieces: number;
  /** Storm: how thick the clouds are. */
  cloud: number;
  /** Storm: how far down the bolt has run (0 to 1) and how bright it is. */
  boltHead: number;
  bolt: number;
  /** A flash over the whole stage. */
  flash: number;
  /** A glow around the card, and a shine across its face. */
  glow: number;
  shine: number;
  /** Rings from the card, as a share of the way out (below 0: none). The second is the first hit's. */
  ring1: number;
  ring2: number;
  /** Whether the real card shows (the pixels hide it until they snap in). */
  card: number;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (from: number, to: number, value: number) => {
  const t = clamp((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};

/**
 * Quick at first, then slow right before the hit: the first 30% of the build covers 60% of the way,
 * the rest creeps. That hold is the suspense; the hit pays it off.
 */
export function suspense(u: number): number {
  const t = clamp(u);
  return t < 0.3 ? (t / 0.3) * 0.6 : 0.6 + ((t - 0.3) / 0.7) * 0.4;
}

const FLASH: Record<number, number> = { 4: 0.42, 6: 0.6, 8: 0.85 };

/**
 * The frame at `ms` into the effect. `rest`: the glow the card keeps once the effect is over (the
 * replay and the clip hold on the card; the live reveal ends dark so the card can glide away).
 */
export function hitFrame(effect: HitEffect, plan: HitPlan, ms: number, rest = 0): HitFrame {
  const pre = clamp(ms / plan.impactMs);
  const after = ms - plan.impactMs;
  const hit = after >= 0;
  const post = clamp(after / Math.max(1, plan.durationMs - plan.impactMs));
  const power = FLASH[plan.shakePx] ?? 0.5;
  const frame: HitFrame = {
    crack: 0,
    burst: 0,
    assemble: 1,
    pieces: 0,
    cloud: 0,
    boltHead: 0,
    bolt: 0,
    flash: hit ? power * (1 - clamp(after / 190)) ** 2 : 0,
    glow: hit ? Math.max(rest, (1 - post) ** 1.4) : 0,
    shine: hit ? 0.75 * (1 - clamp(after / 380)) ** 2 : 0,
    ring1: hit && (plan.first || plan.shakePx >= 8) ? after / 620 : -1,
    ring2: hit && plan.first ? (after - 170) / 620 : -1,
    card: 1,
  };
  if (effect === "shatter") {
    frame.crack = hit ? 1 : suspense(pre);
    frame.burst = hit ? clamp(after / Math.min(620, plan.durationMs - plan.impactMs)) : 0;
  } else if (effect === "storm") {
    frame.cloud = hit ? 1 - smooth(0.05, 0.85, post) : smooth(0, 0.75, pre);
    // A flicker inside the clouds before the strike.
    if (!hit && pre > 0.62 && pre < 0.7) frame.flash = 0.1;
    if (hit && after < 260) {
      frame.boltHead = clamp(after / 45);
      frame.bolt = after < 90 ? 1 : after < 130 ? 0.25 : after < 175 ? 0.85 : 0.85 * (1 - (after - 175) / 85);
    }
  } else {
    frame.assemble = hit ? 1 : suspense(pre);
    frame.pieces = hit ? 1 - clamp(after / 150) : 1;
    frame.card = hit ? 1 : 0;
  }
  return frame;
}
