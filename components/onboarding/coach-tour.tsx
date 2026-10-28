"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOnboarding } from "@/components/onboarding/use-onboarding";
import { TOUR_STEPS, tourStepFrom } from "@/lib/onboarding/first-run";
import { endTour, markTourSeen, showTourStep } from "@/lib/onboarding/store";
import { trapTabTarget } from "@/lib/social/collect-interests";

/** Space between the spotlight and the element it rings. */
const PAD = 6;
const GAP = 14;
const BUBBLE_MAX = 320;
const EDGE = 16;

type Box = { top: number; left: number; width: number; height: number };

/** The element for a step, when it is laid out and at least partly on screen. */
export function tourTarget(target: string): HTMLElement | null {
  const node = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) {
    return null;
  }
  return node;
}

function boxFor(node: HTMLElement): Box {
  const rect = node.getBoundingClientRect();
  return { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };
}

/**
 * Five coach marks over the real UI, one at a time. Everything else dims.
 * A step whose element isn't on screen is skipped. Escape skips the tour;
 * focus stays in the bubble. Finishing or skipping marks it seen.
 */
export function CoachTour({ userId }: { userId: string }) {
  const { tourIndex } = useOnboarding();
  const [box, setBox] = useState<Box | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  const close = useCallback(() => {
    markTourSeen(userId);
    endTour();
  }, [userId]);

  const move = useCallback(
    (from: number, direction: 1 | -1) => {
      const shown = TOUR_STEPS.map((step) => tourTarget(step.target) !== null);
      const index = tourStepFrom(from, shown, direction);
      if (index === null) {
        if (direction === 1) close();
        return;
      }
      showTourStep(index);
    },
    [close],
  );

  // Find the element for this step, or skip past it.
  useLayoutEffect(() => {
    if (tourIndex === null) return;
    const node = tourTarget(TOUR_STEPS[tourIndex].target);
    if (!node) {
      move(tourIndex, 1);
      return;
    }
    const measure = () => setBox(boxFor(node));
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [tourIndex, move]);

  const open = tourIndex !== null;

  // Focus moves into the bubble and comes back when the tour ends.
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const target = returnFocus.current;
      if (target && document.contains(target)) target.focus();
    };
  }, [open]);

  useEffect(() => {
    if (tourIndex === null || !box) return;
    nextRef.current?.focus({ preventScroll: true });
  }, [tourIndex, box]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const bubble = bubbleRef.current;
      if (!bubble) return;
      const items = [...bubble.querySelectorAll<HTMLElement>("button")];
      const index = items.indexOf(document.activeElement as HTMLElement);
      const target = trapTabTarget(items.length, index, event.shiftKey);
      if (target === null) return;
      event.preventDefault();
      items[target]?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (tourIndex === null || !box || typeof document === "undefined") return null;

  const step = TOUR_STEPS[tourIndex];
  const last = tourStepFrom(tourIndex + 1, TOUR_STEPS.map((entry) => tourTarget(entry.target) !== null), 1) === null;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const below = box.top + box.height / 2 < viewportH / 2;
  const width = Math.min(BUBBLE_MAX, viewportW - EDGE * 2);
  const center = box.left + box.width / 2;
  const left = Math.max(EDGE, Math.min(viewportW - EDGE - width, center - width / 2));
  const arrowLeft = Math.max(18, Math.min(width - 18, center - left));
  const vertical = below
    ? { top: `max(${box.top + box.height + GAP}px, calc(env(safe-area-inset-top) + ${EDGE}px))` }
    : { bottom: `max(${viewportH - box.top + GAP}px, calc(env(safe-area-inset-bottom) + ${EDGE}px))` };

  return createPortal(
    <div className="fixed inset-0 z-[80]" data-coach-tour>
      {/* Blocks taps on the dimmed page so nothing changes under the tour. */}
      <div aria-hidden className="absolute inset-0" />
      <div
        aria-hidden
        data-spotlight
        className="pointer-events-none absolute rounded-2xl shadow-[0_0_0_9999px_rgba(9,9,11,0.74)] ring-2 ring-[#A78BFA] transition-[top,left,width,height] duration-300 ease-out motion-reduce:transition-none"
        style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
      />
      <div
        ref={bubbleRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        key={tourIndex}
        className="absolute rounded-2xl border border-white/10 bg-[#18181B] p-4 text-white shadow-[0_24px_60px_-16px_rgba(0,0,0,0.8)] motion-safe:animate-[add-fade_200ms_ease-out_both]"
        style={{ left, width, ...vertical }}
      >
        <span
          aria-hidden
          className={`absolute h-3 w-3 rotate-45 border-white/10 bg-[#18181B] ${
            below ? "-top-1.5 border-t border-l" : "-bottom-1.5 border-r border-b"
          }`}
          style={{ left: arrowLeft - 6 }}
        />
        <p className="font-mono text-[11px] font-medium tracking-wider text-[#A78BFA] uppercase">
          {tourIndex + 1} of {TOUR_STEPS.length}
        </p>
        <h2 id={titleId} className="mt-1 text-[17px] font-extrabold tracking-tight">
          {step.title}
        </h2>
        <p id={bodyId} className="mt-1 text-[15px] leading-5 text-zinc-300">
          {step.body}
        </p>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="min-h-11 rounded-full px-4 text-[15px] font-semibold text-zinc-400 hover:text-white focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:outline-none"
          >
            Skip
          </button>
          <button
            ref={nextRef}
            type="button"
            onClick={() => (last ? close() : move(tourIndex + 1, 1))}
            className="min-h-11 rounded-full bg-violet-600 px-5 text-[15px] font-semibold text-white focus-visible:ring-2 focus-visible:ring-[#A78BFA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#18181B] focus-visible:outline-none"
          >
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
