"use client";

import { Suspense, lazy, useSyncExternalStore } from "react";

// Its own chunk: the intro's effects stay off the landing's first load, and a
// reader who asked for less motion never downloads them.
const Dust = lazy(() => import("@/components/onboarding/intro/effects").then((effects) => ({ default: effects.Dust })));

// The same check as prefersReducedMotion() in landing/showcase/motion.ts,
// inlined so that module (and its count-up helpers) stays off the first load.
const QUERY = "(prefers-reduced-motion: reduce)";

const reducedNow = () => window.matchMedia?.(QUERY).matches === true;

function subscribe(onChange: () => void) {
  const list = window.matchMedia?.(QUERY);
  list?.addEventListener?.("change", onChange);
  return () => list?.removeEventListener?.("change", onChange);
}

/**
 * Signed-out Home's backdrop: the onboarding intro's galaxy, fixed behind the
 * page. The gradient paints with the HTML. The dust joins after hydration
 * (the server and the first client render say "reduced"), and only when the
 * reader hasn't asked for less motion.
 */
export function LandingGalaxy() {
  const reduced = useSyncExternalStore(subscribe, reducedNow, () => true);
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 bg-[linear-gradient(180deg,#09090B_0%,#09090B_30%,#1E1036_100%)]"
    >
      {reduced ? null : (
        <Suspense fallback={null}>
          <Dust />
        </Suspense>
      )}
    </div>
  );
}
