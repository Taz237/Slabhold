"use client";

import { FeedView } from "@/components/feed-view";
import { SeededSocial } from "@/components/social-seed";
import type { HomeSeed } from "@/lib/social/home-seed";

/**
 * The timeline. Loaded only for a signed-in reader. Always inside
 * SeededSocial, seed or not, so it is one tree that never remounts.
 * The timeline no longer draws the movers (they live at /moving-today,
 * from the side menu). The page still reads them and passes `movers`
 * down until a follow-up drops that read.
 */
export function HomeFeed({
  seed = null,
}: {
  /** The page's cached movers read. Unused here until a follow-up drops it. */
  movers: unknown;
  seed?: HomeSeed | null;
}) {
  return (
    <SeededSocial seed={seed}>
      <FeedView seed={seed} />
    </SeededSocial>
  );
}
