"use client";

import { PartLoadFailed } from "@/components/part-load-failed";
import type { ComposePollProps } from "@/components/compose-poll-view";
import { lazyPart } from "@/lib/ui/lazy-part";

/** Until the editor's chunk is in: its frame, so the composer doesn't jump. */
function ComposePollSkeleton() {
  return (
    <div aria-hidden="true" className="mt-3 space-y-2.5 rounded-[20px] border border-zinc-200 p-3 dark:border-white/10">
      <div className="skeleton-shimmer h-12 rounded-lg" />
      <div className="skeleton-shimmer h-12 rounded-lg" />
      <div className="h-11" />
    </div>
  );
}

/**
 * The poll editor. It only draws after a tap on the poll button, so it is its
 * own chunk (components/compose-poll-view.tsx), fetched on the tap.
 */
export const ComposePoll = lazyPart<ComposePollProps>(
  () => import("@/components/compose-poll-view").then((mod) => mod.ComposePollView),
  ComposePollSkeleton,
  { name: "compose-poll", failed: PartLoadFailed },
);
