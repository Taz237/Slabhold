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

/** Follows window.visualViewport (resize + scroll), once per frame. */
export function useVisualViewport(): VisualViewportState {
  const [state, setState] = useState<VisualViewportState>({ frame: null, inset: 0 });
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const box = { height: viewport.height, offsetTop: viewport.offsetTop };
      const next = {
        frame: sheetFrame(box),
        inset: keyboardInset({ ...box, innerHeight: window.innerHeight }),
      };
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
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    update();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return state;
}

/** The keyboard's height over the page, for bars docked to the bottom. */
export function useKeyboardInset(): number {
  return useVisualViewport().inset;
}
