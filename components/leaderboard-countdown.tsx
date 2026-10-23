"use client";

import { useEffect, useRef } from "react";
import { countdownTo } from "@/lib/leaderboard/week";

/** Ticks the reset label without storing the clock in React state. */
export function LeaderboardCountdown({
  resetsAt,
  initialLabel,
}: {
  resetsAt: string;
  initialLabel: string;
}) {
  const node = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = node.current;
    if (!el) return;
    const tick = () => {
      el.textContent = countdownTo(new Date(resetsAt), new Date()).label;
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [resetsAt]);

  return (
    <span ref={node} suppressHydrationWarning>
      {initialLabel}
    </span>
  );
}
