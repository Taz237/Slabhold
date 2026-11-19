"use client";

import { Suspense, lazy, use, useState } from "react";
import { LandingCompContext } from "@/components/landing/landing-links";
import { quickCompEnabled } from "@/lib/quick-comp/flag";
import { afterFirstIdle } from "@/lib/ui/idle";

/*
 * Quick Comp with one real card's stored sold prices (LandingCompProvider).
 * Real data or nothing: with no card, or a photo that fails, the section is
 * not drawn. The panel's code loads once the page is idle, so it is never in
 * the way of the first paint; the server HTML already has the panel.
 */
const LazyDemo = lazy(() =>
  (typeof window === "undefined" ? Promise.resolve() : new Promise<void>((resolve) => afterFirstIdle(resolve))).then(
    () => import("@/components/landing/showcase/quick-comp-demo"),
  ),
);

export function QuickCompSection() {
  const comp = use(LandingCompContext);
  const [failed, setFailed] = useState(false);
  if (!quickCompEnabled() || !comp || !comp.real || failed) return null;
  return (
    <section className="lg-section" data-section="quick-comp" data-media="real">
      <div className="lg-grid lg-rise">
        <div className="lg-copy">
          <h2 className="lg-h2">Quick Comp</h2>
          <p className="lg-lead">Recent sold prices, the median and the range.</p>
        </div>
        <div className="lg-media">
          <div className="lg-comp">
            <Suspense fallback={<div aria-hidden className="skeleton-shimmer h-[344px] rounded-2xl" />}>
              <LazyDemo comp={comp} onPhotoError={() => setFailed(true)} />
            </Suspense>
          </div>
        </div>
      </div>
    </section>
  );
}
