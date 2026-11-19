"use client";

import { ChartNoAxesCombined } from "lucide-react";
import type { ChartShare } from "@/components/collection-actions";
import { CollectionSheet } from "@/components/collection-sheet";
import { PreviewThumb, ShareCollectionActions } from "@/components/invite/share-collection-card";
import { collectionSharePath } from "@/lib/share/links";

/**
 * What the Collection hero's share control opens: Share, Post on X and Save
 * for Stories, the link preview, and the chart image when the collection is
 * public. Its own chunk, fetched ahead of the tap (components/collection-actions.tsx).
 */
export function CollectionShareSheetView({
  username,
  chart,
  onClose,
}: {
  username: string;
  chart: ChartShare | null;
  onClose: () => void;
}) {
  return (
    <CollectionSheet title="Share my collection" onClose={onClose}>
      <PreviewThumb src={`${collectionSharePath(username)}/opengraph-image`} />
      <div className="mt-3">
        <ShareCollectionActions />
      </div>
      {chart ? (
        <button
          type="button"
          onClick={chart.share}
          disabled={chart.sharing}
          aria-label="Share your collection chart"
          className="tap mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-zinc-300 px-4 text-14 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-60 dark:border-white/15"
        >
          <ChartNoAxesCombined aria-hidden className="h-4 w-4" />
          Share chart
        </button>
      ) : null}
      {chart?.failed ? (
        <p role="status" className="mt-2 text-center text-13 text-zinc-500">
          Couldn&apos;t open sharing. Try again.
        </p>
      ) : null}
    </CollectionSheet>
  );
}
