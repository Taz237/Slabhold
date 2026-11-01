"use client";

import { useEffect, useRef, useState } from "react";
import { countUpText } from "@/lib/ui/count-up-text";

const COUNT_UP_MS = 480;

/**
 * A % that counts up from 0 once, drawn by React. The server render and the
 * first paint show the final value. It runs only when on screen, never
 * under reduced motion.
 */
export function CountUp({ text, run = false }: { text: string; run?: boolean }) {
  const [shown, setShown] = useState(text);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!run || !node || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const box = node.getBoundingClientRect();
    if (box.bottom <= 0 || box.top >= window.innerHeight || box.right <= 0 || box.left >= window.innerWidth) return;
    let frame = 0;
    let start = 0;
    const step = (time: number) => {
      start ||= time;
      const progress = Math.min(1, (time - start) / COUNT_UP_MS);
      setShown(countUpText(text, 1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    // Starts on the next frame, after the first paint.
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      setShown(text);
    };
  }, [run, text]);

  return (
    <span ref={ref} data-gain-text="">
      {run ? shown : text}
    </span>
  );
}
