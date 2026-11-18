"use client";

import { useEffect, useState } from "react";
import { PublicCardSkeleton } from "@/components/public-card-skeleton";
import { afterFirstIdle } from "@/lib/ui/idle";
import { lazyPart } from "@/lib/ui/lazy-part";

/** PostPageSkeleton and ProfileSkeleton, in their own chunk: no page's first load carries them. */
const NavPendingKinds = lazyPart(() => import("@/components/nav-pending-kinds").then((mod) => mod.NavPendingKinds));

/**
 * Always in the shell, hidden. A tap on a card tile, a post or a profile sets
 * <html data-nav-pending="card|post|profile"> (lib/ui/tap-feedback.ts) and
 * CSS slides the matching skeleton in on the next frame, before the router
 * has the page. NavMotion clears it in the commit that draws the page, which
 * lands in the same boxes. Under the header, above the page, below the
 * bottom bar. The post and profile skeletons load after the first idle
 * moment; a tap before that slides in the plain page background.
 */
export function NavPendingSkeleton() {
  const [idle, setIdle] = useState(false);
  useEffect(() => afterFirstIdle(() => setIdle(true)), []);
  return (
    <div
      data-nav-pending-skeleton=""
      aria-hidden="true"
      className="fixed inset-x-0 top-[calc(3.25rem+env(safe-area-inset-top))] bottom-0 z-[25] overflow-hidden bg-[var(--background)]"
    >
      <div className="mx-auto w-full max-w-lg px-4 py-5">
        <div data-pending-kind="card">
          <PublicCardSkeleton />
        </div>
        {idle ? <NavPendingKinds /> : null}
      </div>
    </div>
  );
}
