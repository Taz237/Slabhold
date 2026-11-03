"use client";

import { FeedView } from "@/components/feed-view";
import { SeededSocial } from "@/components/social-seed";
import type { HomeSeed } from "@/lib/social/home-seed";

/**
 * The timeline. Loaded only for a signed-in reader. Always inside
 * SeededSocial, seed or not, so it is one tree that never remounts.
 * The timeline doesn't draw the movers; they live at /moving-today, from
 * the side menu.
 */
export function HomeFeed({
  seed = null,
}: {
  seed?: HomeSeed | null;
}) {
  return (
    <SeededSocial seed={seed}>
      <FeedView seed={seed} />
    </SeededSocial>
  );
}
