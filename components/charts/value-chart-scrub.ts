import { dayLabel, nearestIndex } from "@/lib/chart/geometry";
import { money } from "@/lib/format";

/**
 * The full chart's press, drag and arrow-key handling. ValueChart loads
 * this at the first idle moment, or on the first touch, hover or focus,
 * so it stays out of the page's first-load JS. Taps made before it loads
 * are held and replayed in order.
 */

/** What a handler reads from the chart when it runs. */
export type ScrubState = {
  /** x of each point (or dot), left to right. */
  xs: number[];
  withDots: boolean;
  /** The dot chosen from outside, or -1. */
  selectedIndex: number;
  pressed: { current: boolean };
  frame: { current: number };
  activeRef: { current: number | null };
  lastTick: { current: number };
  select: (index: number | null) => void;
};

/**
 * The one chart haptic: a light tick as the scrub lands on a new point or
 * sale. Throttled to 40 ms by its caller; never fired on release.
 */
export function chartHaptic(): void {
  try {
    // ios-shell-1: call nativeTap("light") here
    navigator.vibrate?.(4);
  } catch {
    // Not supported. Nothing to do.
  }
}

function choose(state: ScrubState, index: number | null, haptic: boolean): void {
  if (state.activeRef.current === index) return;
  if (haptic && index != null) {
    const now = Date.now();
    if (now - state.lastTick.current > 40) {
      state.lastTick.current = now;
      chartHaptic();
    }
  }
  state.select(index);
}

/** A press at `x` (from the chart's left edge). The press itself is already noted. */
export function pressAt(state: ScrubState, x: number, pointerType: string): void {
  const index = nearestIndex(state.xs, x);
  if (state.withDots && index >= 0 && index === state.selectedIndex) {
    // Tapping the chosen dot again clears it.
    state.activeRef.current = index;
    choose(state, null, false);
    state.pressed.current = false;
    return;
  }
  // Select on press, not on the next frame, so a quick tap still lands.
  if (index >= 0) choose(state, index, pointerType === "touch");
}

/** A drag (or a mouse hover) over `x`, drawn on the next frame. */
export function scrubTo(state: ScrubState, x: number, pointerType: string): void {
  window.cancelAnimationFrame(state.frame.current);
  state.frame.current = window.requestAnimationFrame(() => {
    const index = nearestIndex(state.xs, x);
    if (index >= 0) choose(state, index, pointerType === "touch");
  });
}

export function release(state: ScrubState): void {
  state.pressed.current = false;
  window.cancelAnimationFrame(state.frame.current);
  if (!state.withDots) choose(state, null, false);
}

/** Arrow keys step through the points; Escape clears. */
export function keyDown(state: ScrubState, key: string): void {
  const { xs } = state;
  if (!xs.length) return;
  const current = state.withDots ? (state.selectedIndex >= 0 ? state.selectedIndex : null) : state.activeRef.current;
  if (key === "ArrowRight" || key === "ArrowLeft") {
    const delta = key === "ArrowRight" ? 1 : -1;
    const next = current == null ? (delta > 0 ? 0 : xs.length - 1) : Math.min(xs.length - 1, Math.max(0, current + delta));
    state.activeRef.current = current;
    choose(state, next, false);
  } else if (key === "Escape") {
    state.activeRef.current = current;
    choose(state, null, false);
  }
}

const TIP_H = 22;

/**
 * The scrub tooltip: "$212.49 · Oct 9" (or the date alone, when the headline
 * already shows the value), above the point, below it when there is no room,
 * and never past the plot's edges. Widths are estimated for Geist at 12px, so
 * nothing is measured.
 */
export function chartTip(input: {
  x: number;
  y: number;
  plotRight: number;
  value: number;
  date: string;
  marker?: string | null;
  dateOnly: boolean;
}): { text: string; w: number; left: number; top: number } {
  const room = Math.floor((input.plotRight - 20) / 7);
  let text = [input.dateOnly ? null : money(input.value), dayLabel(input.date), input.marker].filter(Boolean).join(" · ");
  if (text.length > room) text = `${text.slice(0, Math.max(room - 1, 1)).trimEnd()}…`;
  const w = Math.min(Math.ceil(text.length * 7 + 20), input.plotRight);
  const above = input.y - 10 - TIP_H;
  return {
    text,
    w,
    left: Math.round(Math.min(Math.max(input.x - w / 2, 0), input.plotRight - w)),
    top: Math.round(above >= 0 ? above : input.y + 10),
  };
}
