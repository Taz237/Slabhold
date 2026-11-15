/**
 * Bottom sheets: when a downward drag takes over, how far the sheet follows
 * the finger, and whether letting go closes it. Pure functions only. The
 * browser wiring is in lib/ui/use-sheet-drag.ts.
 */

/** Travel before a drag is told apart from a tap or a sideways move. */
export const SHEET_ARM_PX = 8;

/** Past this share of the sheet's height, letting go closes it. */
export const SHEET_CLOSE_RATIO = 0.3;

/** A flick down this fast (px per ms) closes it even when it is short. */
export const SHEET_FLICK_VELOCITY = 0.5;

/** How long the sheet takes to slide away or settle back. */
export const SHEET_SETTLE_MS = 240;

/**
 * A mostly downward move claims the gesture, but only while the content
 * under the finger is scrolled to its top: otherwise the list scrolls.
 */
export function sheetDragClaims(input: { deltaX: number; deltaY: number; scrollTop: number }): "wait" | "claim" | "release" {
  const { deltaX, deltaY, scrollTop } = input;
  if (Math.abs(deltaX) > SHEET_ARM_PX && Math.abs(deltaX) > Math.abs(deltaY)) return "release";
  if (deltaY < -SHEET_ARM_PX) return "release";
  if (deltaY > SHEET_ARM_PX && deltaY > Math.abs(deltaX)) return scrollTop > 0 ? "release" : "claim";
  return "wait";
}

/** The sheet follows the finger down 1:1 and never rises above where it rests. */
export function sheetDragOffset(deltaY: number): number {
  return Math.max(0, deltaY);
}

/** Letting go: far enough, or a quick flick down. A flick back up keeps it open. */
export function sheetReleaseCloses(input: { deltaY: number; height: number; velocity: number }): boolean {
  if (input.height <= 0 || input.deltaY <= 0) return false;
  if (input.velocity <= -SHEET_FLICK_VELOCITY / 2) return false;
  if (input.velocity >= SHEET_FLICK_VELOCITY) return true;
  return input.deltaY / input.height >= SHEET_CLOSE_RATIO;
}
