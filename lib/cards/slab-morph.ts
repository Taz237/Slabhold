/**
 * Save → reveal: the Review slab glides into the reveal slab.
 *
 * Route changes already run inside the app shell's React <ViewTransition>
 * (components/app-shell.tsx), and the reveal mounts after the card page's
 * loading boundary, so the two slabs are never on screen in one view
 * transition. Starting a second transition by hand would cancel the shell's.
 * Instead the save records where the Review slab was, and the reveal plays a
 * short move-and-scale from there (FLIP) with the Web Animations API.
 * Navigation never waits on it. Reduced motion, or no Web Animations, is a
 * plain swap.
 */
export const SLAB_MORPH_MS = 340;
export const SLAB_MORPH_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
/** Marks the Review slab the morph starts from. */
export const SLAB_MORPH_SOURCE = '[data-slab-morph="source"]';
/** A save older than this is not this reveal's. */
const FRESH_MS = 2500;

export type MorphRect = { left: number; top: number; width: number; height: number };

type MorphEnv = {
  matchMedia?: (query: string) => { matches: boolean };
  document?: { querySelector(selector: string): unknown };
};

let pending: { rect: MorphRect; at: number } | null = null;

export function slabMorphAllowed(env: MorphEnv | undefined = globalEnv()): boolean {
  if (!env) return false;
  try {
    return !env.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function globalEnv(): MorphEnv | undefined {
  return typeof window === "undefined" ? undefined : (window as unknown as MorphEnv);
}

/** Called on save, right before navigating. True when the reveal will morph. */
export function captureSlabMorph(env: MorphEnv | undefined = globalEnv(), now = Date.now()): boolean {
  pending = null;
  if (!env || !slabMorphAllowed(env)) return false;
  const source = env.document?.querySelector(SLAB_MORPH_SOURCE) as
    | { getBoundingClientRect?: () => MorphRect; animate?: unknown }
    | null
    | undefined;
  if (!source || typeof source.getBoundingClientRect !== "function" || typeof source.animate !== "function") {
    return false;
  }
  const box = source.getBoundingClientRect();
  if (!(box.width > 0 && box.height > 0)) return false;
  pending = { rect: { left: box.left, top: box.top, width: box.width, height: box.height }, at: now };
  return true;
}

/** The reveal takes the saved spot once. Null when there is none or it went stale. */
export function takeSlabMorph(now = Date.now()): MorphRect | null {
  const taken = pending;
  pending = null;
  if (!taken || now - taken.at > FRESH_MS) return null;
  return taken.rect;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function morphKeyframes(from: MorphRect, to: MorphRect): Keyframe[] {
  const dx = round(from.left - to.left);
  const dy = round(from.top - to.top);
  const sx = round(from.width / to.width);
  const sy = round(from.height / to.height);
  return [
    { transformOrigin: "top left", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
    { transformOrigin: "top left", transform: "none" },
  ];
}

/** Plays the move-and-scale on the reveal slab. False when it can't. */
export function playSlabMorph(
  target: { getBoundingClientRect(): MorphRect; animate?: (frames: Keyframe[], options: KeyframeAnimationOptions) => unknown },
  from: MorphRect,
): boolean {
  if (typeof target.animate !== "function") return false;
  const to = target.getBoundingClientRect();
  if (!(to.width > 0 && to.height > 0)) return false;
  target.animate(morphKeyframes(from, to), { duration: SLAB_MORPH_MS, easing: SLAB_MORPH_EASE, fill: "backwards" });
  return true;
}
