"use client";

import { usePathname } from "next/navigation";
import { useEffect, type CSSProperties } from "react";
import { Logo } from "@/components/logo";
import { useOnboarding } from "@/components/onboarding/use-onboarding";
import { tourAutoStarts } from "@/lib/onboarding/first-run";
import { endCelebration, startCelebration, startTour, tourSeen } from "@/lib/onboarding/store";

/** How long "You're in" stays before the tour starts. */
export const YOURE_IN_MS = 2600;

const CONFETTI = ["#7C3AED", "#A78BFA", "#5B21B6", "#34C1AE", "#F4F4F5", "#7C3AED", "#A78BFA", "#5B21B6", "#7C3AED", "#A78BFA", "#34C1AE", "#F4F4F5"];

/**
 * A small moment on Home right after setup: a shine across the toast and a
 * short burst of brand confetti, then the quick tour. Reduced motion keeps
 * the toast and drops the motion.
 */
export function YoureIn({ userId, username }: { userId: string; username: string }) {
  const pathname = usePathname() || "/";
  const { welcomePending, celebrating } = useOnboarding();

  useEffect(() => {
    if (welcomePending && pathname === "/") startCelebration();
  }, [welcomePending, pathname]);

  useEffect(() => {
    if (!celebrating) return;
    const timer = window.setTimeout(() => {
      endCelebration();
      if (tourAutoStarts({ seen: tourSeen(userId), setupJustFinished: true })) startTour();
    }, YOURE_IN_MS);
    return () => window.clearTimeout(timer);
  }, [celebrating, userId]);

  if (!celebrating) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-4 pt-[calc(env(safe-area-inset-top)+4.5rem)]">
      <div aria-hidden className="absolute inset-x-0 top-0 h-64 overflow-hidden">
        {CONFETTI.map((color, index) => (
          <span
            key={index}
            className="youre-in-confetti absolute top-0 h-2.5 w-1.5 rounded-[2px]"
            style={
              {
                left: `${8 + index * 7.5}%`,
                backgroundColor: color,
                animationDelay: `${(index % 4) * 90}ms`,
                "--drift": `${(index % 2 === 0 ? -1 : 1) * (12 + (index % 3) * 8)}px`,
                "--spin": `${(index % 2 === 0 ? 1 : -1) * (200 + index * 20)}deg`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div
        role="status"
        aria-live="polite"
        className="youre-in-pop relative flex items-center gap-3 overflow-hidden rounded-full border border-violet-500/30 bg-[#18181B] py-2.5 pr-5 pl-2.5 text-white shadow-[0_18px_50px_-12px_rgba(124,58,237,0.9)]"
      >
        <Logo className="h-9 w-9" />
        <span>
          <span className="block text-[17px] leading-5 font-extrabold tracking-tight">You&apos;re in.</span>
          <span className="block text-[13px] text-zinc-400">Welcome to Slabhold, @{username}.</span>
        </span>
        <span aria-hidden className="youre-in-shine absolute inset-0" />
      </div>
    </div>
  );
}
