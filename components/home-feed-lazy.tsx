"use client";

import { lazy, Suspense, type ComponentProps } from "react";
import { TimelineSkeleton } from "@/components/post-skeleton";

function FeedSkeleton() {
  return (
    <div className="-mx-4 -mt-5">
      <TimelineSkeleton />
    </div>
  );
}

const loadHomeFeed = () => import("@/components/home-feed");
const HomeFeed = lazy(() => loadHomeFeed().then((mod) => ({ default: mod.HomeFeed })));

/**
 * Signed-in Home's timeline, in its own chunk. Signed-out visitors get the
 * landing page and never download it. The server draws it when the request
 * came with a first screen, and that HTML stays up until the chunk is in;
 * otherwise the feed's own skeleton holds the spot. React.lazy, not
 * next/dynamic, so Home's own chunk stays as small as before.
 */
export function HomeFeedLazy(props: ComponentProps<typeof HomeFeed>) {
  return (
    <Suspense fallback={<FeedSkeleton />}>
      <HomeFeed {...props} />
    </Suspense>
  );
}

/** Start fetching the timeline's chunk, e.g. while the page hydrates. */
export function preloadHomeFeed(): void {
  void loadHomeFeed().catch(() => {});
}
