/**
 * The photo viewer's motion math: carousel snap, swipe to dismiss, the
 * shared-element open and close, zoom and the spring curve. Pure, so it is
 * tested without a browser; components/image-lightbox.tsx applies it as
 * transform and opacity only.
 */

export type Rect = { left: number; top: number; width: number; height: number };
export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
/** Zoom: a scale and a pan from the screen's center, in screen px. */
export type ZoomState = { x: number; y: number; scale: number };

/** Open and close, in ms. */
export const OPEN_MS = 250;
/** Gap between photos in the carousel, like the iOS Photos app. */
export const SLIDE_GAP = 16;
export const MAX_ZOOM = 4;
export const DOUBLE_TAP_ZOOM = 2.5;
/** px/ms. Faster than this is a flick. */
const FLICK = 0.35;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/** iOS-style resistance: the farther you pull, the less it moves. */
export function rubberBand(overshoot: number, dimension: number, constant = 0.55): number {
  if (overshoot === 0 || dimension <= 0) return 0;
  const distance = Math.abs(overshoot);
  return Math.sign(overshoot) * (1 - 1 / ((distance * constant) / dimension + 1)) * dimension;
}

/** The carousel follows the finger, with resistance past the first and last photo. */
export function trackOffset(dx: number, index: number, count: number, width: number): number {
  const pastStart = index <= 0 && dx > 0;
  const pastEnd = index >= count - 1 && dx < 0;
  return pastStart || pastEnd ? rubberBand(dx, width) : dx;
}

/** Where the carousel settles: a flick picks its direction, else past halfway moves on. */
export function snapIndex({
  index,
  count,
  dx,
  vx,
  width,
}: {
  index: number;
  count: number;
  dx: number;
  vx: number;
  width: number;
}): number {
  let step = 0;
  if (Math.abs(vx) > FLICK) {
    // A flick back against the drag cancels it, like iOS.
    const against = dx !== 0 && Math.sign(vx) !== Math.sign(dx);
    step = against ? 0 : vx < 0 ? 1 : -1;
  } else if (Math.abs(dx) > width / 2) step = dx < 0 ? 1 : -1;
  return clamp(index + step, 0, Math.max(0, count - 1));
}

/** Release a vertical drag: close past the threshold or on a flick, unless flicked back. */
export function shouldDismiss({ dy, vy, height }: { dy: number; vy: number; height: number }): boolean {
  if (Math.abs(vy) > FLICK * 1.5) {
    if (Math.sign(vy) === Math.sign(dy) || dy === 0) return Math.abs(dy) > 40;
    return false;
  }
  return Math.abs(dy) > Math.min(140, height * 0.16);
}

/** 0 at rest, 1 when dragged far: the background fades and the photo shrinks with it. */
export function dismissProgress(dy: number, height: number): number {
  if (height <= 0) return 0;
  return clamp(Math.abs(dy) / (height * 0.45), 0, 1);
}

/** The photo's box when it fits the screen. */
export function containRect(natural: Size, box: Rect): Rect {
  if (natural.width <= 0 || natural.height <= 0) return { ...box };
  const scale = Math.min(box.width / natural.width, box.height / natural.height);
  const width = Math.round(natural.width * scale);
  const height = Math.round(natural.height * scale);
  return {
    left: Math.round(box.left + (box.width - width) / 2),
    top: Math.round(box.top + (box.height - height) / 2),
    width,
    height,
  };
}

/**
 * The transform and clip that make the fullscreen photo sit exactly where its
 * thumbnail is. "cover" thumbnails are cropped, so the clip trims the photo to
 * the thumbnail's box. Apply the transform with its origin at the target's
 * center, and the clip on the photo itself.
 */
export function sharedElementFrom(
  origin: { rect: Rect; fit: "cover" | "contain"; radius: number },
  target: Rect,
): { transform: string; clip: string } {
  const { rect } = origin;
  const pick = origin.fit === "cover" ? Math.max : Math.min;
  const scale = pick(rect.width / target.width, rect.height / target.height) || 1;
  const dx = rect.left + rect.width / 2 - (target.left + target.width / 2);
  const dy = rect.top + rect.height / 2 - (target.top + target.height / 2);
  const insetX = origin.fit === "cover" ? Math.max(0, (target.width - rect.width / scale) / 2) : 0;
  const insetY = origin.fit === "cover" ? Math.max(0, (target.height - rect.height / scale) / 2) : 0;
  const radius = origin.radius / scale;
  return {
    transform: `translate3d(${round(dx)}px, ${round(dy)}px, 0) scale(${round(scale)})`,
    clip: `inset(${round(insetY)}px ${round(insetX)}px ${round(insetY)}px ${round(insetX)}px round ${round(radius)}px)`,
  };
}

/** A zoomed photo can't be panned past its own edges; at 1x it stays centered. */
export function clampPan(state: ZoomState, fitted: Size, screen: Size): Point {
  const maxX = Math.max(0, (fitted.width * state.scale - screen.width) / 2);
  const maxY = Math.max(0, (fitted.height * state.scale - screen.height) / 2);
  return { x: clamp(state.x, -maxX, maxX) || 0, y: clamp(state.y, -maxY, maxY) || 0 };
}

/** Change the scale and keep `point` (from the screen's center) under the finger. */
export function zoomAt(point: Point, from: ZoomState, scale: number): ZoomState {
  const ratio = scale / from.scale;
  return {
    scale,
    x: point.x - (point.x - from.x) * ratio,
    y: point.y - (point.y - from.y) * ratio,
  };
}

/** Two fingers: scale by their spread, around their midpoint, which also pans. */
export function pinchTo(
  start: { pan: ZoomState; mid: Point; distance: number },
  now: { mid: Point; distance: number },
): ZoomState {
  let scale = start.pan.scale * (now.distance / Math.max(1, start.distance));
  if (scale > MAX_ZOOM) scale = MAX_ZOOM + rubberBand(scale - MAX_ZOOM, 1);
  if (scale < 1) scale = 1 - rubberBand(1 - scale, 1, 0.8);
  const ratio = scale / start.pan.scale;
  return {
    scale,
    x: now.mid.x - (start.mid.x - start.pan.x) * ratio,
    y: now.mid.y - (start.mid.y - start.pan.y) * ratio,
  };
}

/**
 * A damped spring sampled as a CSS linear() curve: a fast start and a tiny
 * settle, like UIKit's default spring. Runs on the compositor like any easing.
 */
export function springEasing(samples = 24, damping = 0.86): string {
  const omega = 7 / damping;
  const damped = omega * Math.sqrt(1 - damping * damping);
  const points: string[] = [];
  for (let i = 1; i < samples; i += 1) {
    const t = i / samples;
    const decay = Math.exp(-damping * omega * t);
    const value = 1 - decay * (Math.cos(damped * t) + ((damping * omega) / damped) * Math.sin(damped * t));
    points.push(String(Math.round(value * 1000) / 1000));
  }
  return `linear(0, ${points.join(", ")}, 1)`;
}

/** For engines without linear(): close to the iOS sheet curve. */
export const SPRING_FALLBACK = "cubic-bezier(0.32, 0.72, 0, 1)";
