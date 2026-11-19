import { useSyncExternalStore } from "react";

type ViewportBox = { height: number; offsetTop: number; scale?: number };

/** Where a fixed top: 0; bottom: 0 box really sits, in client px. */
export type FixedBox = { top: number; bottom: number };

/** Below this the "keyboard" is just Safari's toolbar moving. */
const KEYBOARD_MIN = 80;

/** The visual viewport has to shrink this much, against the closed height, to count as a keyboard. */
export const KEYBOARD_OPEN_SHRINK = 120;

/** How much of the layout viewport the on-screen keyboard covers, in px. 0 when it's closed. */
export function keyboardInset(input: ViewportBox & { innerHeight: number }): number {
  const overlap = Math.max(0, input.innerHeight - input.height - input.offsetTop);
  return overlap > KEYBOARD_MIN ? Math.round(overlap) : 0;
}

/** Where a full-screen sheet sits so its last child rests on the keyboard. null: use 100dvh. */
export function sheetFrame(viewport: ViewportBox | null): { top: number; height: number } | null {
  if (!viewport) return null;
  return { top: Math.round(viewport.offsetTop), height: Math.round(viewport.height) };
}

export type VisualViewportState = {
  /** The part of the screen above the keyboard, as top/height styles for a fixed sheet. null: use 100dvh. */
  frame: { top: number; height: number } | null;
  /**
   * How far a fixed bottom: 0 box has to lift to sit on the keyboard. Measured,
   * so it can be 0 with the keyboard open: a web view that shrank, or fixed
   * boxes that already follow the visual viewport, put bottom: 0 on the keys.
   */
  inset: number;
  /** The keyboard is up. Hide the tab bar and drop safe-area padding off this, never off inset. */
  keyboardOpen: boolean;
};

export const KEYBOARD_CLOSED: VisualViewportState = { frame: null, inset: 0, keyboardOpen: false };

/**
 * Where the keyboard is, measured instead of assumed.
 *
 * - The visible part of the page ends at the visual viewport's bottom edge.
 * - The iOS app's keyboardWillShow height says the keys cover the bottom of the
 *   screen, which is `baseline` tall (the web view's height with the keyboard
 *   closed). That only counts while the web view overlays the keys
 *   (`nativeOverlays`); a web view that resizes has already moved its bottom up.
 * - `probe` is where a fixed top: 0; bottom: 0 box really is. The lift a bottom: 0
 *   box needs is the gap between the probe's bottom and the keyboard's top, so
 *   the keyboard is never counted on top of a viewport that already shrank.
 */
export function resolveKeyboard(input: {
  viewport: ViewportBox | null;
  innerHeight: number;
  /** keyboardHeight from the iOS app's keyboardWillShow, 0 once it hides. */
  native: number;
  /** innerHeight while the keyboard was last closed. Defaults to innerHeight. */
  baseline?: number;
  /** Where fixed boxes sit. Defaults to the layout viewport: 0 to innerHeight. */
  probe?: FixedBox | null;
  /** False once the web view is known to resize for the keyboard. */
  nativeOverlays?: boolean;
}): VisualViewportState {
  const { viewport, innerHeight } = input;
  const baseline = Math.max(input.baseline ?? innerHeight, innerHeight);
  const probe = input.probe ?? { top: 0, bottom: innerHeight };
  const native = input.native > KEYBOARD_MIN ? input.native : 0;
  const visibleTop = viewport?.offsetTop ?? 0;
  const visibleBottom = viewport ? viewport.offsetTop + viewport.height : innerHeight;
  const zoomed = (viewport?.scale ?? 1) > 1.01;
  const shrunk = viewport ? baseline - viewport.height : 0;
  const keyboardOpen = native > 0 || (!zoomed && shrunk > KEYBOARD_OPEN_SHRINK);
  if (!keyboardOpen) {
    if (!viewport) return KEYBOARD_CLOSED;
    return { frame: sheetFrame(viewport), inset: 0, keyboardOpen: false };
  }
  let keyboardTop = visibleBottom;
  if (native > 0 && input.nativeOverlays !== false) {
    keyboardTop = Math.min(keyboardTop, visibleTop + baseline - native);
  }
  const lift = probe.bottom - keyboardTop;
  return {
    frame: {
      top: Math.round(visibleTop - probe.top),
      height: Math.max(0, Math.round(keyboardTop - visibleTop)),
    },
    inset: lift > 1 ? Math.round(lift) : 0,
    keyboardOpen: true,
  };
}

/**
 * One shared reader for every screen: the visual viewport (resize + scroll),
 * the iOS app's keyboard events, and a hidden fixed probe, read once per frame.
 * The closed height is remembered while the keyboard is down, so a web view
 * that shrinks is seen as a shrink and not as more keyboard.
 */
const listeners = new Set<() => void>();
let snapshot: VisualViewportState = KEYBOARD_CLOSED;
let stop: (() => void) | null = null;

function emit(next: VisualViewportState) {
  if (
    snapshot.inset === next.inset &&
    snapshot.keyboardOpen === next.keyboardOpen &&
    snapshot.frame?.top === next.frame?.top &&
    snapshot.frame?.height === next.frame?.height
  ) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) listener();
}

function start(): () => void {
  const viewport = window.visualViewport ?? null;
  let native = 0;
  let baseline = window.innerHeight;
  /** null until the first open shows whether the web view resizes for the keys. */
  let nativeOverlays: boolean | null = null;
  let frame = 0;
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.dataset.keyboardProbe = "";
  probe.style.cssText =
    "position:fixed;top:0;bottom:0;left:0;width:0;visibility:hidden;pointer-events:none;contain:strict";
  document.body.append(probe);

  const measure = (): FixedBox | null => {
    const rect = probe.getBoundingClientRect();
    // Not laid out (a test DOM): fall back to the layout viewport.
    return rect.bottom > 0 ? { top: rect.top, bottom: rect.bottom } : null;
  };

  const read = () => {
    frame = 0;
    const box = viewport ? { height: viewport.height, offsetTop: viewport.offsetTop, scale: viewport.scale } : null;
    const innerHeight = window.innerHeight;
    const next = resolveKeyboard({
      viewport: box,
      innerHeight,
      native,
      baseline,
      probe: measure(),
      nativeOverlays: nativeOverlays ?? true,
    });
    if (!next.keyboardOpen) baseline = innerHeight;
    emit(next);
  };
  const update = () => {
    if (!frame) frame = window.requestAnimationFrame(read);
  };
  const height = (event: Event) => Number((event as Event & { keyboardHeight?: number }).keyboardHeight) || 0;
  const onWillShow = (event: Event) => {
    native = height(event);
    update();
  };
  const onDidShow = (event: Event) => {
    native = height(event);
    // Learn once: if the page itself got shorter by about the keys, it resizes.
    const visible = viewport ? viewport.height : window.innerHeight;
    if (native > KEYBOARD_MIN) nativeOverlays = baseline - visible < native / 2;
    update();
  };
  const onHide = () => {
    native = 0;
    update();
  };
  viewport?.addEventListener("resize", update);
  viewport?.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  window.addEventListener("keyboardWillShow", onWillShow);
  window.addEventListener("keyboardDidShow", onDidShow);
  window.addEventListener("keyboardWillHide", onHide);
  window.addEventListener("keyboardDidHide", onHide);
  update();
  return () => {
    if (frame) window.cancelAnimationFrame(frame);
    viewport?.removeEventListener("resize", update);
    viewport?.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
    window.removeEventListener("keyboardWillShow", onWillShow);
    window.removeEventListener("keyboardDidShow", onDidShow);
    window.removeEventListener("keyboardWillHide", onHide);
    window.removeEventListener("keyboardDidHide", onHide);
    probe.remove();
    snapshot = KEYBOARD_CLOSED;
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!stop) stop = start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stop) {
      stop();
      stop = null;
    }
  };
}

const closed = () => KEYBOARD_CLOSED;

/** The keyboard, for sheets that size to the part of the screen above it. */
export function useVisualViewport(): VisualViewportState {
  return useSyncExternalStore(subscribe, () => snapshot, closed);
}

/** The lift for a bar docked to the bottom, and whether the keyboard is up. */
export function useKeyboardInset(): { inset: number; keyboardOpen: boolean } {
  const { inset, keyboardOpen } = useVisualViewport();
  return { inset, keyboardOpen };
}

/** Just whether the keyboard is up: re-renders only when that flips. For the app's chrome. */
export function useKeyboardOpen(): boolean {
  return useSyncExternalStore(subscribe, () => snapshot.keyboardOpen, () => false);
}
