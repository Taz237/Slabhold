import { useEffect, useState } from "react";

type ViewportBox = { height: number; offsetTop: number };

/** Below this the "keyboard" is just Safari's toolbar moving. */
const KEYBOARD_MIN = 80;

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
  frame: { top: number; height: number } | null;
  inset: number;
};

/**
 * Where the keyboard is, from two sources. Safari shrinks the visual viewport.
 * The iOS app (Capacitor Keyboard, resize "none") leaves the web view full
 * height, so the viewport never moves; there the plugin's keyboardWillShow
 * height is the only sign of the keyboard. The bigger of the two wins.
 */
export function resolveKeyboard(input: {
  viewport: ViewportBox | null;
  innerHeight: number;
  /** keyboardHeight from the iOS app's keyboardWillShow, 0 once it hides. */
  native: number;
}): VisualViewportState {
  const { viewport, innerHeight } = input;
  const fromViewport = viewport ? keyboardInset({ ...viewport, innerHeight }) : 0;
  const native = input.native > KEYBOARD_MIN ? Math.round(input.native) : 0;
  if (native > fromViewport) {
    const top = Math.round(viewport?.offsetTop ?? 0);
    return { frame: { top, height: Math.max(0, Math.round(innerHeight) - native - top) }, inset: native };
  }
  return { frame: sheetFrame(viewport), inset: fromViewport };
}

/** Follows window.visualViewport (resize + scroll) and the iOS app's keyboard events, once per frame. */
export function useVisualViewport(): VisualViewportState {
  const [state, setState] = useState<VisualViewportState>({ frame: null, inset: 0 });
  useEffect(() => {
    const viewport = window.visualViewport ?? null;
    let native = 0;
    let frame = 0;
    const read = () => {
      frame = 0;
      const box = viewport ? { height: viewport.height, offsetTop: viewport.offsetTop } : null;
      const next = resolveKeyboard({ viewport: box, innerHeight: window.innerHeight, native });
      setState((current) =>
        current.inset === next.inset &&
        current.frame?.top === next.frame?.top &&
        current.frame?.height === next.frame?.height
          ? current
          : next,
      );
    };
    const update = () => {
      if (!frame) frame = window.requestAnimationFrame(read);
    };
    const onNativeShow = (event: Event) => {
      native = Number((event as Event & { keyboardHeight?: number }).keyboardHeight) || 0;
      update();
    };
    const onNativeHide = () => {
      native = 0;
      update();
    };
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("keyboardWillShow", onNativeShow);
    window.addEventListener("keyboardDidShow", onNativeShow);
    window.addEventListener("keyboardWillHide", onNativeHide);
    window.addEventListener("keyboardDidHide", onNativeHide);
    update();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("keyboardWillShow", onNativeShow);
      window.removeEventListener("keyboardDidShow", onNativeShow);
      window.removeEventListener("keyboardWillHide", onNativeHide);
      window.removeEventListener("keyboardDidHide", onNativeHide);
    };
  }, []);
  return state;
}

/** The keyboard's height over the page, for bars docked to the bottom. */
export function useKeyboardInset(): number {
  return useVisualViewport().inset;
}
