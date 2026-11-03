"use client";

import { useEffect, useRef } from "react";
import { EASE, canAnimate } from "@/components/landing/showcase/motion";

/**
 * The intro's ambient layer and small payoffs. Every loop here pauses while
 * the tab is hidden, and none of it runs with reduced motion (the caller
 * leaves it out).
 */

/** Pauses `animations` while the tab is hidden. Returns a stop. */
export function pauseWhenHidden(animations: () => (Animation | null | undefined)[]): () => void {
  if (typeof document === "undefined") return () => {};
  const onChange = () => {
    for (const animation of animations()) {
      if (!animation) continue;
      if (document.visibilityState === "hidden") animation.pause();
      else if (animation.playState === "paused") animation.play();
    }
  };
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

const DUST_COUNT = 20;

/** Stable pseudo-random numbers, so the dust is the same every time. */
function seeded(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/** Soft dust drifting up the whole screen. Transform and opacity only. */
export function Dust() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const animations = [...node.children].map((child, index) => {
      if (!canAnimate(child)) return null;
      const duration = 14000 + seeded(index, 1) * 10000;
      const drift = (seeded(index, 2) - 0.5) * 48;
      const animation = child.animate(
        [
          { transform: "translate3d(0, 0, 0)", opacity: 0 },
          { opacity: 0.55, offset: 0.2 },
          { opacity: 0.4, offset: 0.8 },
          { transform: `translate3d(${drift}px, -110vh, 0)`, opacity: 0 },
        ],
        { duration, iterations: Infinity, easing: "linear" },
      );
      animation.currentTime = seeded(index, 3) * duration;
      return animation;
    });
    const stop = pauseWhenHidden(() => animations);
    return () => {
      stop();
      for (const animation of animations) animation?.cancel();
    };
  }, []);
  return (
    <div ref={root} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: DUST_COUNT }, (_, index) => {
        const size = 2 + Math.round(seeded(index, 4) * 2);
        return (
          <span
            key={index}
            className="absolute rounded-full bg-[#A78BFA] opacity-0"
            style={{ left: `${Math.round(seeded(index, 5) * 100)}%`, top: "100%", width: size, height: size }}
          />
        );
      })}
    </div>
  );
}

const SPARKS = 10;

/** A small burst of sparks from the center of `host`. The sparks remove themselves. */
export function sparks(host: HTMLElement | null, colors: readonly string[] = ["#A78BFA", "#F4F4F5", "#7C3AED"]) {
  if (!canAnimate(host)) return;
  for (let index = 0; index < SPARKS; index += 1) {
    const spark = document.createElement("i");
    spark.setAttribute("aria-hidden", "true");
    spark.style.cssText = `position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px;border-radius:9999px;pointer-events:none;background:${colors[index % colors.length]}`;
    host.appendChild(spark);
    const angle = (Math.PI * 2 * index) / SPARKS;
    const distance = 36 + seeded(index, 6) * 20;
    const animation = spark.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(0.4)`, opacity: 0 },
      ],
      { duration: 420, easing: EASE, fill: "forwards" },
    );
    animation.onfinish = () => spark.remove();
  }
}

/** A quick bump, the visual's answer to something landing in it. */
export function bump(node: Element | null | undefined) {
  if (!canAnimate(node)) return;
  node.animate([{ transform: "scale(1)" }, { transform: "scale(1.035)", offset: 0.4 }, { transform: "scale(1)" }], {
    duration: 320,
    easing: EASE,
  });
}

/**
 * A slow, continuous 3D tilt and a light glint passing over, so a slab reads
 * as glass. Returns the running animations.
 */
export function tiltAndGlint(tilt: HTMLElement | null, glint: HTMLElement | null): Animation[] {
  const running: Animation[] = [];
  if (canAnimate(tilt)) {
    running.push(
      tilt.animate(
        [
          { transform: "rotateX(4deg) rotateY(-8deg)" },
          { transform: "rotateX(-3deg) rotateY(8deg)" },
        ],
        { duration: 6000, iterations: Infinity, direction: "alternate", easing: EASE },
      ),
    );
  }
  if (canAnimate(glint)) {
    running.push(
      glint.animate([{ transform: "translateX(-100%)" }, { transform: "translateX(100%)" }], {
        duration: 1600,
        endDelay: 2800,
        iterations: Infinity,
        easing: EASE,
      }),
    );
  }
  return running;
}
