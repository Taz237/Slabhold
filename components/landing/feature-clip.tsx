"use client";

import { Suspense, lazy } from "react";
import type { MediaSlot } from "@/lib/landing/media";

/*
 * A real recording of the app in a glass phone. The player's code is its own
 * chunk, so a page with no clips never downloads it. The server HTML already
 * has the phone, the poster and the button; until the player arrives, the
 * empty phone holds the same space.
 */
const Player = lazy(() => import("@/components/landing/feature-clip-player"));

export function FeatureClip({ slot, label }: { slot: MediaSlot; label: string }) {
  return (
    <Suspense
      fallback={
        <div aria-hidden className="lg-phone lg-glass">
          <div className="lg-phone-screen" style={{ aspectRatio: `${slot.width} / ${slot.height}` }} />
        </div>
      }
    >
      <Player slot={slot} label={label} />
    </Suspense>
  );
}
