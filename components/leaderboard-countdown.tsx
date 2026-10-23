"use client";

import { useEffect, useRef } from "react";
import { countdownTo, reloadKeyForReset, shouldReloadForReset } from "@/lib/leaderboard/week";

/** Ticks the reset label without storing the clock in React state. */
export function LeaderboardCountdown({
  resetsAt,
  initialLabel,
}: {
  resetsAt: string;
  initialLabel: string;
}) {
  const node = useRef<HTMLSpanElement>(null);
  const pastAtMount = useRef<boolean | null>(null);

  useEffect(() => {
    const el = node.current;
    if (!el) return;
    const key = reloadKeyForReset(resetsAt);
    const tick = () => {
      const left = countdownTo(new Date(resetsAt), new Date());
      el.textContent = left.label;
      if (pastAtMount.current === null) pastAtMount.current = left.done;
      let alreadyReloaded = true;
      try {
        alreadyReloaded = sessionStorage.getItem(key) === "1";
      } catch {
        alreadyReloaded = true;
      }
      if (!shouldReloadForReset({ done: left.done, pastAtMount: pastAtMount.current === true, alreadyReloaded })) {
        return;
      }
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        return;
      }
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
