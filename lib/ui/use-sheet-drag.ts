"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  SHEET_SETTLE_MS,
  sheetDragClaims,
  sheetDragOffset,
  sheetReleaseCloses,
} from "@/lib/ui/sheet-drag";

const REDUCED = "(prefers-reduced-motion: reduce)";
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

function reducedMotion() {
  try {
    return window.matchMedia(REDUCED).matches;
  } catch {
    return false;
  }
}

/** How far the nearest scrolling box between the touch and the sheet has scrolled. */
function scrollTopUnder(target: EventTarget | null, panel: HTMLElement): number {
  let node = target instanceof Element ? (target as HTMLElement) : null;
  while (node && node !== panel) {
    if (node.scrollHeight > node.clientHeight && node.scrollTop > 0) return node.scrollTop;
    node = node.parentElement;
  }
  return panel.scrollTop;
}

function typing(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

/**
 * A bottom sheet you can swipe down to close, and that slides away when it
 * closes. Put `panelRef` on the sheet and `rootRef` on the layer that holds
 * it and its backdrop. Returns `dismiss`: call it where you used to call
 * onClose (backdrop, Close button) and the sheet slides down first. As a
 * click handler it also stops the tap there, so it can't open what is behind.
 * Transform and opacity only. With Reduce Motion it closes at once.
 */
export function useSheetDrag(
  panelRef: RefObject<HTMLElement | null>,
  rootRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): (event?: { stopPropagation?: () => void }) => void {
  const onCloseRef = useRef(onClose);
  const closing = useRef(false);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const slideAway = useCallback((event?: { stopPropagation?: () => void }) => {
    // A tap on the backdrop closes the sheet and nothing else: it never
    // reaches the post row the sheet was opened from.
    event?.stopPropagation?.();
    if (closing.current) return;
    closing.current = true;
    const panel = panelRef.current;
    const root = rootRef.current;
    if (!panel || reducedMotion()) {
      onCloseRef.current();
      return;
    }
    // The open animation holds the sheet in place once it ends. Let go of it.
    panel.style.animation = "none";
    panel.style.transition = `transform ${SHEET_SETTLE_MS}ms ${EASE}`;
    if (root) {
      root.style.animation = "none";
      root.style.transition = `opacity ${SHEET_SETTLE_MS}ms ease-out`;
    }
    // Next frame, so the transition starts from where the sheet is now.
    const nextFrame = window.requestAnimationFrame ?? ((run: () => void) => window.setTimeout(run, 16));
    nextFrame(() => {
      panel.style.transform = "translate3d(0, 100%, 0)";
      if (root) root.style.opacity = "0";
    });
    window.setTimeout(() => onCloseRef.current(), SHEET_SETTLE_MS);
  }, [panelRef, rootRef]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    let tracking = false;
    let claimed = false;
    let startX = 0;
    let startY = 0;
    let deltaY = 0;
    let frame = 0;
    let samples: Array<{ y: number; t: number }> = [];

    function paint() {
      frame = 0;
      if (!panel) return;
      panel.style.transform = `translate3d(0, ${sheetDragOffset(deltaY)}px, 0)`;
    }

    function stopWatching() {
      panel?.removeEventListener("touchmove", onTouchMove);
    }

    function onTouchStart(event: TouchEvent) {
      stopWatching();
      tracking = false;
      claimed = false;
      if (event.touches.length !== 1 || closing.current || typing(event.target)) return;
      const touch = event.touches[0];
      tracking = true;
      startX = touch.clientX;
      startY = touch.clientY;
      deltaY = 0;
      samples = [{ y: touch.clientY, t: event.timeStamp }];
      panel?.addEventListener("touchmove", onTouchMove, { passive: false });
    }

    function onTouchMove(event: TouchEvent) {
      if (!tracking || !panel || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (!claimed) {
        const decision = sheetDragClaims({ deltaX: dx, deltaY: dy, scrollTop: scrollTopUnder(event.target, panel) });
        if (decision === "release") {
          tracking = false;
          stopWatching();
          return;
        }
        if (decision === "wait") return;
        claimed = true;
        panel.style.animation = "none";
        panel.style.transition = "none";
        panel.style.willChange = "transform";
      }
      if (event.cancelable) event.preventDefault();
      deltaY = dy;
      samples.push({ y: touch.clientY, t: event.timeStamp });
      if (samples.length > 5) samples.shift();
      if (!frame) frame = window.requestAnimationFrame(paint);
    }

    function onTouchEnd() {
      stopWatching();
      if (!tracking || !panel) return;
      tracking = false;
      if (!claimed) return;
      claimed = false;
      window.cancelAnimationFrame(frame);
      frame = 0;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const elapsed = first && last ? last.t - first.t : 0;
      const velocity = first && last && elapsed > 0 ? (last.y - first.y) / elapsed : 0;
      panel.style.willChange = "";
      if (sheetReleaseCloses({ deltaY, height: panel.offsetHeight, velocity })) {
        slideAway();
        return;
      }
      panel.style.transition = reducedMotion() ? "none" : `transform ${SHEET_SETTLE_MS}ms ${EASE}`;
      panel.style.transform = "translate3d(0, 0, 0)";
    }

    panel.addEventListener("touchstart", onTouchStart, { passive: true });
    panel.addEventListener("touchend", onTouchEnd);
    panel.addEventListener("touchcancel", onTouchEnd);
    return () => {
      stopWatching();
      window.cancelAnimationFrame(frame);
      panel.removeEventListener("touchstart", onTouchStart);
      panel.removeEventListener("touchend", onTouchEnd);
      panel.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [panelRef, slideAway]);

  return slideAway;
}
