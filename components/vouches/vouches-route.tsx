"use client";

import { PartLoadFailed } from "@/components/part-load-failed";
import { VouchesPageSkeleton } from "@/components/vouches/vouches-skeleton";
import { lazyPart } from "@/lib/ui/lazy-part";

/**
 * The vouches page. Its view is its own chunk (components/vouches/vouches-page.tsx), so nothing
 * of it is in what a profile or the timeline loads.
 */
export const VouchesRoute = lazyPart<{ username: string }>(
  () => import("@/components/vouches/vouches-page").then((mod) => mod.VouchesPage),
  VouchesPageSkeleton,
  { name: "vouches-page", failed: PartLoadFailed },
);
