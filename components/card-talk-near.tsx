"use client";

import { CardCollectorsSayingPending, LazyCardCollectorsSaying } from "@/components/card-talk-frame";
import { WhenNear } from "@/lib/ui/when-near";

/**
 * The posts section once it scrolls near the viewport. On the owner's card
 * page it sits far below the fold, so its chunk, its post reads and its
 * render wait until then. Until then (and on the server) it draws the same
 * frame and skeleton it always drew while loading.
 */
export function NearCardCollectorsSaying(props: { cardId: string; heading?: string }) {
  return (
    <WhenNear fallback={<CardCollectorsSayingPending {...props} />}>
      <LazyCardCollectorsSaying {...props} />
    </WhenNear>
  );
}
