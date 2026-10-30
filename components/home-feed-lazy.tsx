"use client";

import { TimelineSkeleton } from "@/components/status";
import type { MovingTodayPayload } from "@/lib/moving-today/types";
import { lazyPart } from "@/lib/ui/lazy-part";

function FeedSkeleton() {
  return (
    <div className="-mx-4 -mt-5">
      <TimelineSkeleton />
    </div>
  );
}

/**
 * Signed-in Home's timeline, in its own chunk. Signed-out visitors get the
 * landing page and never download it. Until it is in, the feed's own
 * skeleton holds the spot; once preloaded it draws straight away.
 */
export const HomeFeedLazy = lazyPart<{ movers: MovingTodayPayload | null }>(
  () => import("@/components/home-feed").then((mod) => mod.HomeFeed),
  FeedSkeleton,
);
