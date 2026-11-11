"use client";

import { useEffect, type ComponentType } from "react";
import { INTRO_STEPS } from "@/lib/onboarding/intro";
import { lazyPart } from "@/lib/ui/lazy-part";

type IntroProps = { userId: string; onEnd: () => void };

const PULSE = "motion-safe:animate-pulse motion-reduce:animate-none";

/**
 * Holds the screen while the intro's chunk loads: the intro's own background,
 * dots, art frame, title and button, quiet. The setup never flashes first.
 */
export function IntroLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      data-intro-loading=""
      className="fixed inset-0 z-50 flex flex-col bg-[linear-gradient(180deg,#09090B_0%,#09090B_30%,#1E1036_100%)]"
    >
      <div className="mx-auto w-full max-w-lg px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div data-skeleton="" className="flex h-11 items-center justify-center gap-1.5">
          {Array.from({ length: INTRO_STEPS }, (_, index) => (
            <span
              key={index}
              className={`block h-1.5 rounded-full ${index === 0 ? "w-6 bg-[#7C3AED]" : "w-1.5 bg-white/20"}`}
            />
          ))}
        </div>
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 items-center justify-center px-4 py-4">
        <div
          data-skeleton=""
          className={`aspect-[5/7] w-[min(60%,240px)] rounded-2xl border border-white/10 bg-white/[0.04] ${PULSE}`}
        />
      </div>
      <div className="mx-auto flex w-full max-w-lg flex-col items-center px-6">
        <div data-skeleton="" className={`h-7 w-56 rounded-lg bg-white/10 ${PULSE}`} />
        <div data-skeleton="" className={`mt-3 h-4 w-64 max-w-full rounded bg-white/[0.06] ${PULSE}`} />
        <div className={`mt-2 h-4 w-44 rounded bg-white/[0.06] ${PULSE}`} />
      </div>
      <div className="mx-auto w-full max-w-lg px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div data-skeleton="" className="h-[52px] w-full rounded-full bg-[#7C3AED]/40" />
      </div>
    </div>
  );
}

/** The intro's code would not load (after one retry): go straight to setup, this time only. */
function IntroSkipped({ onEnd }: IntroProps & { retry: () => void }) {
  useEffect(() => {
    onEnd();
  }, [onEnd]);
  return <IntroLoading />;
}

/** The intro as its own chunk, with a skeleton while it loads and a quiet skip if it can't. */
export function introPart(load: () => Promise<ComponentType<IntroProps>>) {
  return lazyPart<IntroProps>(load, IntroLoading, { name: "onboarding-intro", failed: IntroSkipped });
}

/** The five-screen intro: fetched only when a new account is about to see it. */
export const OnboardingIntroPart = introPart(() =>
  import("@/components/onboarding/intro/intro").then((mod) => mod.default),
);
