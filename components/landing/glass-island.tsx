"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { tiltFor } from "@/components/landing/tilt";

/** The most the glass slab leans toward the pointer, in degrees. */
export const SLAB_TILT_MAX = 8;

const DESKTOP = "(min-width: 768px)";
const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * The hero's only client code. The slab leans toward a mouse on desktop and
 * its sheen slides with it: three CSS variables on the node (.lg-tilt in
 * app/landing.css), no state, no re-render. Touch, small screens and readers
 * who asked for less motion get the still slab.
 */
export function SlabTilt({ children }: { children: ReactNode }) {
  const node = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  function lean(event: PointerEvent<HTMLDivElement>) {
    const target = node.current;
    if (!target || event.pointerType !== "mouse") return;
    if (!window.matchMedia?.(DESKTOP).matches || window.matchMedia?.(REDUCED).matches) return;
    const { clientX, clientY } = event;
    window.cancelAnimationFrame(frame.current);
    frame.current = window.requestAnimationFrame(() => {
      const box = target.getBoundingClientRect();
      const tilt = tiltFor(clientX - box.left, clientY - box.top, box.width, box.height, SLAB_TILT_MAX);
      target.style.setProperty("--tilt-x", `${tilt.x}deg`);
      target.style.setProperty("--tilt-y", `${tilt.y}deg`);
      target.style.setProperty("--sheen", String(tilt.y / SLAB_TILT_MAX));
      target.setAttribute("data-tilting", "");
    });
  }

  function settle() {
    const target = node.current;
    if (!target) return;
    window.cancelAnimationFrame(frame.current);
    target.style.removeProperty("--tilt-x");
    target.style.removeProperty("--tilt-y");
    target.style.removeProperty("--sheen");
    target.removeAttribute("data-tilting");
  }

  return (
    <div ref={node} data-slab-tilt="" onPointerMove={lean} onPointerLeave={settle} className="lg-tilt">
      {children}
    </div>
  );
}

/**
 * One 44px control that holds every loop on the page (the galaxy, the shards,
 * the pulls row): it sets data-motion on the landing root and CSS does the
 * rest. Hidden for readers who asked for less motion, where nothing loops.
 */
export function MotionPause() {
  const [paused, setPaused] = useState(false);
  return (
    <button
      type="button"
      className="lg-pause lg-glass"
      aria-label={paused ? "Play background motion" : "Pause background motion"}
      aria-pressed={paused}
      onClick={(event) => {
        const next = !paused;
        const root = event.currentTarget.closest(".lg");
        if (next) root?.setAttribute("data-motion", "paused");
        else root?.removeAttribute("data-motion");
        setPaused(next);
      }}
    >
      <svg aria-hidden viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
        {paused ? <path d="M4.5 2.5v11l9-5.5-9-5.5Z" /> : <path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" />}
      </svg>
    </button>
  );
}
