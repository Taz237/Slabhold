"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";

/** The most a tilted card leans, in degrees. */
export const TILT_MAX_DEG = 7;

/** Where the pointer is over the box, as a lean: left edge leans left, top edge leans back. */
export function tiltFor(x: number, y: number, width: number, height: number, max = TILT_MAX_DEG): { x: number; y: number } {
  if (width <= 0 || height <= 0) return { x: 0, y: 0 };
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  const round = (value: number) => Math.round(value * 100) / 100 || 0;
  return {
    x: round(-clamp((y / height) * 2 - 1) * max),
    y: round(clamp((x / width) * 2 - 1) * max),
  };
}

/**
 * A card or phone that leans toward the pointer, or a finger resting on it,
 * and settles back when it leaves. Two CSS variables on the node and one
 * transform (.landing-tilt in globals.css): no state, no re-render, and it
 * stays flat for readers who asked for less motion. Touch still scrolls the
 * page: the lean ends when the browser takes the gesture.
 */
export function Tilt({ children, className = "" }: { children: ReactNode; className?: string }) {
  const node = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  function lean(event: PointerEvent<HTMLDivElement>) {
    const target = node.current;
    if (!target || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const { clientX, clientY } = event;
    window.cancelAnimationFrame(frame.current);
    frame.current = window.requestAnimationFrame(() => {
      const box = target.getBoundingClientRect();
      const tilt = tiltFor(clientX - box.left, clientY - box.top, box.width, box.height);
      target.style.setProperty("--tilt-x", `${tilt.x}deg`);
      target.style.setProperty("--tilt-y", `${tilt.y}deg`);
      target.setAttribute("data-tilting", "");
    });
  }

  function settle() {
    const target = node.current;
    if (!target) return;
    window.cancelAnimationFrame(frame.current);
    target.style.removeProperty("--tilt-x");
    target.style.removeProperty("--tilt-y");
    target.removeAttribute("data-tilting");
  }

  return (
    <div
      ref={node}
      data-tilt=""
      onPointerDown={lean}
      onPointerMove={lean}
      onPointerLeave={settle}
      onPointerUp={(event) => (event.pointerType === "mouse" ? undefined : settle())}
      onPointerCancel={settle}
      className={`landing-tilt ${className}`}
    >
      {children}
    </div>
  );
}
