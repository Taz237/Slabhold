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
  const refreshed = useRef(false);

  useEffect(() => {
    const el = node.current;
    if (!el) return;
    const tick = () => {
      const left = countdownTo(new Date(resetsAt), new Date());
      el.textContent = left.label;
      if (!left.done || refreshed.current) return;
      refreshed.current = true;
      window.location.reload();
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
