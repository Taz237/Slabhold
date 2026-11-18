"use client";

import { useEffect, useRef } from "react";
import { Timer } from "lucide-react";
import { countdownTo, reloadKeyForReset, shouldReloadForReset } from "@/lib/leaderboard/week";

type Parts = { days: number; hours: number; minutes: number; seconds: number };

const UNITS = [
  ["days", "d"],
  ["hours", "h"],
  ["minutes", "m"],
  ["seconds", "s"],
] as const;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** "Resets in 4d 14h 22m": the spoken label. No seconds, so it changes once a minute. */
function spoken(parts: Parts): string {
  return `Resets in ${parts.days}d ${pad(parts.hours)}h ${pad(parts.minutes)}m`;
}

/**
 * The reset clock: days, hours, minutes and seconds in their own cells. It
 * ticks by writing text, never React state, and reloads the page once when
 * the week rolls over.
 */
export function LeaderboardCountdown({ resetsAt, initial }: { resetsAt: string; initial: Parts }) {
  const root = useRef<HTMLSpanElement>(null);
  const pastAtMount = useRef<boolean | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const key = reloadKeyForReset(resetsAt);
    const cells = UNITS.map(([unit]) => el.querySelector<HTMLElement>(`[data-clock="${unit}"]`));
    const tick = () => {
      const left = countdownTo(new Date(resetsAt), new Date());
      UNITS.forEach(([unit], index) => {
        const cell = cells[index];
        const text = unit === "days" ? String(left.days) : pad(left[unit]);
        if (cell && cell.textContent !== text) cell.textContent = text;
      });
      const label = spoken(left);
      if (el.getAttribute("aria-label") !== label) el.setAttribute("aria-label", label);
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
    <span
      ref={root}
      role="timer"
      data-reset-clock=""
      aria-label={spoken(initial)}
      className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums"
      suppressHydrationWarning
    >
      <Timer aria-hidden="true" className="mr-0.5 hidden h-4 w-4 text-[#A78BFA] min-[360px]:block" />
      {UNITS.map(([unit, letter]) => (
        <span key={unit} aria-hidden="true" className="lb-clock-cell">
          <span data-clock={unit} suppressHydrationWarning>
            {unit === "days" ? initial.days : pad(initial[unit])}
          </span>
          <span className="lb-clock-unit">{letter}</span>
        </span>
      ))}
    </span>
  );
}
